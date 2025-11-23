// -------------------- Machine state --------------------
const MEM_SIZE = 1 << 12; // 4096 words
let MEM = new Array(MEM_SIZE).fill('0000'); 
let PC=0, AR=0, IR=0, AC=0, DR=0, E=0;
let SC=0; // microcycle
let halted=false;
let profiler = {cycles:0, instr:0, reads:0, writes:0};
let runTimer=null;


// -------------------- Instruction maps --------------------
const regRefMap = {
  0x7800:'CLA',0x7400:'CLE',0x7200:'CMA',0x7100:'CME',
  0x7080:'CIR',0x7040:'CIL',0x7020:'INC',0x7010:'SPA',
  0x7008:'SNA',0x7004:'SZA',0x7002:'SZE',0x7001:'HLT'
};
const memOpMap = {0x0:'AND',0x1:'ADD',0x2:'LDA',0x3:'STA',0x4:'BUN',0x5:'BSA',0x6:'ISZ'};

// -------------------- Helpers --------------------
const hex4=n=> (n&0xFFFF).toString(16).toUpperCase().padStart(4,'0');
const hex3=n=> (n&0xFFF).toString(16).toUpperCase().padStart(3,'0');
const parseHexTok=s=>parseInt(s,16);
function flashEl(el){ if(!el) return; el.classList.add('flash'); setTimeout(()=>el.classList.remove('flash'),480); }
function pushTrace(line){ const t=document.getElementById('trace'); t.textContent=line+'\n'+t.textContent; }

// -------------------- Update UI --------------------
function updateUI(changed=[]){
  document.getElementById('vPC').textContent=hex3(PC);
  document.getElementById('vAR').textContent=hex3(AR);
  document.getElementById('vIR').textContent=hex4(IR);
  document.getElementById('vAC').textContent=hex4(AC);
  document.getElementById('vDR').textContent=hex4(DR);
  document.getElementById('vE').textContent=E? '1':'0';

  ['vPC','vAR','vIR','vAC','vDR','vE'].forEach(id=>{
    const el=document.getElementById(id);
    el?.classList.remove('current','flash');
  });
  changed.forEach(c=>{
    const el=document.getElementById('v'+c);
    if(el){ el.classList.add('current'); flashEl(el); setTimeout(()=>el.classList.remove('current'),420); }
  });

  document.getElementById('cycles').textContent=profiler.cycles;
  document.getElementById('instrs').textContent=profiler.instr;
  document.getElementById('reads').textContent=profiler.reads;
  document.getElementById('writes').textContent=profiler.writes;
  document.getElementById('cpi').textContent=profiler.instr? (profiler.cycles/profiler.instr).toFixed(2) :'0.00';

  renderMemTable();
  renderInstrTable();
}

// -------------------- Render Memory --------------------
function renderMemTable(){
  const tbody=document.querySelector('#memtable tbody');
  tbody.innerHTML='';
  for(let i=0;i<256;i++){
    const tr=document.createElement('tr');
    tr.setAttribute('data-addr',i);
    if(i===PC) tr.classList.add('current');
    tr.innerHTML=`<td class="addr">${hex3(i)}</td><td class="val">${MEM[i]}</td>`;
    tbody.appendChild(tr);
  }
}

// -------------------- Render Instructions --------------------
function renderInstrTable(){
  const tbody=document.querySelector('#itable tbody');
  tbody.innerHTML='';
  for(let i=0;i<256;i++){
    const code = MEM[i] || '0000';
    const val = parseHexTok(code);
    let mnem='DATA';
    if(regRefMap[val]) mnem=regRefMap[val];
    else {
      const top=parseInt(code[0],16);
      if(memOpMap[top]) mnem=memOpMap[top]+' '+code.slice(1);
    }
    const tr=document.createElement('tr');
    if(i===PC) tr.classList.add('current');
    tr.innerHTML=`<td class="addr">${hex3(i)}</td><td class="val">${code}</td><td>${mnem}</td>`;
    tbody.appendChild(tr);
  }
}

// -------------------- Load Program --------------------
document.getElementById('btnLoad').addEventListener('click',()=>{
  const file=document.getElementById('file').files[0];
  if(!file){ alert('Select a .txt program file'); return; }
  const reader=new FileReader();
  reader.onload=()=>{
    const text=reader.result;
    MEM=new Array(MEM_SIZE).fill('0000');
    text.split(/\r?\n/).forEach(line=>{
      line=line.trim();
      if(!line) return;
      const parts=line.split(/\s+/);
      if(parts.length<2) return;
      const addr=parseInt(parts[0],16);
      const val=parts[1].toUpperCase().padStart(4,'0');
      if(!Number.isNaN(addr) && addr>=0 && addr<MEM_SIZE) MEM[addr]=val;
    });
    PC=AR=IR=AC=DR=E=0; SC=0; halted=false;
    profiler={cycles:0,instr:0,reads:0,writes:0};
    pushTrace('Program loaded — memory initialized.');
    updateUI(['PC','AR','IR','AC','DR']);
  };
  reader.readAsText(file);
});
document.getElementById('cliBtn').addEventListener('click', () => {
  const cmd = document.getElementById('cliInput').value.trim().toLowerCase();
  const out = document.getElementById('cliOutput');
  const parts = cmd.split(/\s+/);

  // ============================
  // SHOW REG COMMAND
  // ============================
  if(parts[0] === "show" && ["ac","pc","ar","ir","dr","e"].includes(parts[1])){
      const reg = parts[1].toUpperCase();
      const value = {
        AC, PC, AR, IR, DR, E
      }[reg];

      out.textContent = `${reg} = ${value.toString(16).padStart(4,'0').toUpperCase()}`;
      return;
  }

  // ============================
  // SHOW MEM address [count]
  // ============================
  if(parts[0] === "show" && parts[1] === "mem"){
      let start = parseInt(parts[2],16);
      let count = parts[3] ? parseInt(parts[3],10) : 1;
      let end = start + count - 1;

      highlightMemory(start,end);

      let text = "";
      for(let i=start;i<=end;i++){
        text += `${i.toString(16).padStart(3,'0').toUpperCase()}: ${MEM[i].toString(16).padStart(4,'0').toUpperCase()}\n`;
      }
      out.textContent = text;
      return;
  }

  // ============================
  // SHOW ALL (registers + profiler)
  // ============================
 if (cmd.startsWith("show ")) {
    let parts = cmd.split(" ");

    // ---- show AC / show PC / show IR / show MAR / show MBR ----
    if (parts.length === 2) {
        let reg = parts[1].toUpperCase();

        if (["AC","PC","IR","MAR","MBR","OUT","IN"].includes(reg)) {
            log(`🔍 ${reg} = ${registers[reg]}`);
            return;
        }
    }

    // ===== show mem ADDRESS [COUNT] =====
    if (parts.length >= 3 && parts[1] === "mem") {
        let address = parseInt(parts[2], 16);
        let count = parts[3] ? parseInt(parts[3]) : 1;

        if (isNaN(address)) {
            log("❌ Invalid hex address.");
            return;
        }

        highlightMemory(address); // You already have this function

        log(`📘 Memory from ${parts[2].toUpperCase()} for ${count} cell(s):`);
        for (let i = 0; i < count; i++) {
            let addr = (address + i) & 0xFFF;
            log(`${addr.toString(16).padStart(3,"0").toUpperCase()}: ${memory[addr].toUpperCase()}`);
        }
        return;
    }

    // ===== show all =====
    if (cmd === "show all") {
        log("📙 All Registers:");
        Object.keys(registers).forEach(r => {
            log(`${r}: ${registers[r]}`);
        });

        log("\n📘 Full Memory Dump:");
        for (let i = 0; i < 4096; i++) {
            log(`${i.toString(16).padStart(3,"0").toUpperCase()}: ${memory[i]}`);
        }
        return;
    }

    // ===== show profiler =====
    if (cmd === "show profiler") {
        log("📊 Profiler:");
        log(`Total cycles: ${profiler.cycles}`);
        log(`Instructions executed: ${profiler.instructions}`);
        return;
    }
}

  // UNKNOWN COMMAND
  out.textContent = "Unknown command";
});

// -------------------- MicroStep --------------------
function microStep(){
  if(halted){ pushTrace('Machine halted.'); return; }
  profiler.cycles++;
  pushTrace(`T${SC}: IR=0x${hex4(IR)}`);

  if(SC===0){ AR=PC; updateUI(['AR']); pushTrace('T0: AR <- PC'); SC=1; return; }
  if(SC===1){ 
    IR=parseHexTok(MEM[AR]||'0000'); PC=(PC+1)&0xFFF; profiler.reads++; updateUI(['IR','PC']);
    pushTrace(`T1: IR <- M[AR] (0x${hex4(IR)}), PC <- PC+1`); SC=2; return;
  }
  if(SC===2){ 
    const opcodeTop=(IR&0xF000)>>12, addr=IR&0x0FFF;
    pushTrace(`T2: decode opcode_top=0x${opcodeTop.toString(16)} addr=0x${hex3(addr)}`);
    SC=3; return;
  }

  const opcodeTop=(IR&0xF000)>>12, addr=IR&0x0FFF;

  if(opcodeTop!==0x7){ // memory-reference
    if(SC===3){ AR=addr; updateUI(['AR']); pushTrace('T3: AR <- address(IR)'); SC=4; return; }
    if(SC===4){
      const opName=memOpMap[opcodeTop]||'UNK';
      // highlight memory
      document.querySelectorAll('#memtable tr').forEach(r=>r.classList.remove('highlight'));
      const row=document.querySelector(`#memtable tr[data-addr="${AR}"]`);
      if(row) row.classList.add('highlight');

      if(opName==='STA'){ MEM[AR]=hex4(AC); profiler.writes++; updateUI(['DR']); pushTrace(`T4: M[AR] <- AC (${hex4(AC)})`); SC=0; profiler.instr++; return; }
      else if(opName==='BUN'){ PC=AR; pushTrace('T4: PC <- AR'); updateUI(['PC']); SC=0; profiler.instr++; return; }
      else if(opName==='BSA'){ MEM[AR]=hex4(PC); profiler.writes++; PC=(AR+1)&0xFFF; pushTrace('T4: M[AR] <- PC; PC <- AR+1'); updateUI(['PC']); SC=0; profiler.instr++; return; }
      else { DR=parseHexTok(MEM[AR]||'0000'); profiler.reads++; updateUI(['DR']); pushTrace(`T4: DR <- M[AR] (0x${hex4(DR)})`); SC=5; return; }
    }
    if(SC===5){
      const opName=memOpMap[opcodeTop]||'UNK';
      if(opName==='AND'){ AC=AC&DR; pushTrace('T5: AC <- AC & DR'); updateUI(['AC']); }
      else if(opName==='ADD'){ let sum=AC+DR; E=(sum>0xFFFF)?1:0; AC=sum&0xFFFF; pushTrace('T5: AC <- AC + DR ; E<-carry'); updateUI(['AC','E']); }
      else if(opName==='LDA'){ AC=DR; pushTrace('T5: AC <- DR'); updateUI(['AC']); }
      else if(opName==='ISZ'){ let v=(DR+1)&0xFFFF; MEM[AR]=hex4(v); profiler.writes++; pushTrace('T5: M[AR] <- DR+1'); if(v===0){ PC=(PC+1)&0xFFF; pushTrace('T5b: PC <- PC+1'); updateUI(['PC']); } }
      SC=0; profiler.instr++; return;
    }
  } else { // register-reference
    if(SC===3){
      const full=IR&0xFFFF;
      let changed=[];
      if(regRefMap[full]){
        const name=regRefMap[full];
        pushTrace(`T3: Register-ref ${name} executed`);
        switch(name){
          case 'CLA': AC=0; changed.push('AC'); break;
          case 'CLE': E=0; changed.push('E'); break;
          case 'CMA': AC=(~AC)&0xFFFF; changed.push('AC'); break;
          case 'CME': E=E^1; changed.push('E'); break;
          case 'CIR': { let newE=AC&1; AC=((AC>>1)|(E<<15))&0xFFFF; E=newE; changed.push('AC'); changed.push('E'); } break;
          case 'CIL': { let newE=(AC>>15)&1; AC=(((AC<<1)&0xFFFF)|E)&0xFFFF; E=newE; changed.push('AC'); changed.push('E'); } break;
          case 'INC': AC=(AC+1)&0xFFFF; changed.push('AC'); break;
          case 'SPA': if(((AC>>15)&1)===0){ PC=(PC+1)&0xFFF; changed.push('PC'); } break;
          case 'SNA': if(((AC>>15)&1)===1){ PC=(PC+1)&0xFFF; changed.push('PC'); } break;
          case 'SZA': if(AC===0){ PC=(PC+1)&0xFFF; changed.push('PC'); } break;
          case 'SZE': if(E===0){ PC=(PC+1)&0xFFF; changed.push('PC'); } break;
          case 'HLT': halted=true; pushTrace('HLT executed'); changed.push('IR'); break;
        }
      }
      updateUI(changed); SC=0; profiler.instr++; return;
    }
  }
}

// -------------------- Controls --------------------
function stepMicroCycle(){ microStep(); updateUI(); }
document.getElementById('btnStep').addEventListener('click',()=>{ if(halted) pushTrace('Machine halted'); else stepMicroCycle(); });

function nextInstruction(){
  if(halted){ pushTrace('Machine halted'); return; }
  pushTrace('--- next_inst ---');
  let started=false;
  while(true){ if(halted) break; if(SC===0 && started) break; microStep(); started=true; }
  pushTrace('--- inst complete ---'); updateUI();
}
document.getElementById('btnInst').addEventListener('click',nextInstruction);

document.getElementById('btnRun').addEventListener('click',()=>{
  if(runTimer) return;
  const speed=parseInt(document.getElementById('speed').value,10);
  runTimer=setInterval(()=>{
    if(halted){ clearInterval(runTimer); runTimer=null; pushTrace('Stopped (halted)'); return; }
    microStep(); updateUI();
  },speed);
});

document.getElementById('btnHalt').addEventListener('click',()=>{ halted=true; if(runTimer){clearInterval(runTimer); runTimer=null;} pushTrace('Execution halted'); updateUI(); });

document.getElementById('btnReset').addEventListener('click',()=>{
  MEM=new Array(MEM_SIZE).fill('0000'); PC=AR=IR=AC=DR=E=0; SC=0; halted=false;
  profiler={cycles:0,instr:0,reads:0,writes:0};
  updateUI(['PC','AR','IR','AC','DR']); pushTrace('Simulator reset');
});

// -------------------- CLI --------------------
document.getElementById('cliBtn').addEventListener('click',()=>{
  const cmd=document.getElementById('cliInput').value.trim().toLowerCase();
  const out=document.getElementById('cliOutput');
  if(cmd.startsWith('show mem')){
    const parts=cmd.split(/\s+/);
    let start=parseInt(parts[2],16)||0;
    let end=parseInt(parts[3],16)||start+15;
    let text='';
    for(let i=start;i<=end;i++) text+=hex3(i)+': '+(MEM[i]||'0000')+'\n';
    out.textContent=text;
    // highlight memory
    document.querySelectorAll('#memtable tr').forEach(r=>r.classList.remove('highlight'));
    for(let i=start;i<=end;i++){
      const row=document.querySelector(`#memtable tr[data-addr="${i}"]`);
      if(row) row.classList.add('highlight');
    }
  } else out.textContent='Unknown command';
});

// -------------------- Initial Render --------------------
updateUI();
renderMemTable();
renderInstrTable();
