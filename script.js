// script.js
// Full Mano-style CPU simulator - complete file with indirect addressing fix

// -------------------- Machine state --------------------
const MEM_SIZE = 1 << 12; // 4096 words (12-bit addresses)
let MEM = new Array(MEM_SIZE).fill('0000'); // stored as 4-digit hex strings
let PC = 0, AR = 0, IR = 0, AC = 0, DR = 0, E = 0;
let SC = 0; // microcycle state
let halted = false;

let profiler = { cycles: 0, instr: 0, reads: 0, writes: 0 };
let runTimer = null;

// -------------------- Instruction maps --------------------
const regRefMap = {
  0x7800: 'CLA', 0x7400: 'CLE', 0x7200: 'CMA', 0x7100: 'CME',
  0x7080: 'CIR', 0x7040: 'CIL', 0x7020: 'INC', 0x7010: 'SPA',
  0x7008: 'SNA', 0x7004: 'SZA', 0x7002: 'SZE', 0x7001: 'HLT'
};
const memOpMap = { 0x0: 'AND', 0x1: 'ADD', 0x2: 'LDA', 0x3: 'STA', 0x4: 'BUN', 0x5: 'BSA', 0x6: 'ISZ' };

// -------------------- Helpers --------------------
const hex4 = n => (n & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
const hex3 = n => (n & 0xFFF).toString(16).toUpperCase().padStart(3, '0');
const hex2 = n => (n & 0xFF).toString(16).toUpperCase().padStart(2, '0');
const parseHexTok = s => parseInt(s, 16);

function flashEl(el) { if (!el) return; el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 480); }
function pushTrace(line) { const t = document.getElementById('trace'); if (t) t.textContent = line + '\n' + t.textContent; }

// -------------------- UI helpers: highlighting & rendering --------------------
function highlightMemory(start, end) {
  document.querySelectorAll('#memtable tbody tr').forEach(r => r.classList.remove('highlight'));
  if (typeof start !== 'number' || isNaN(start)) return;
  if (typeof end !== 'number' || isNaN(end)) end = start;

  start = Math.max(0, start);
  end = Math.min(end, MEM_SIZE - 1);

  const low = Math.max(0, start);
  const high = Math.min(end, 255);
  for (let i = low; i <= high; i++) {
    const row = document.querySelector(`#memtable tr[data-addr="${i}"]`);
    if (row) row.classList.add('highlight');
  }
}

// -------------------- Update UI --------------------
function updateUI(changed = []) {
  const safeSet = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

  safeSet('vPC', hex3(PC));
  safeSet('vAR', hex3(AR));
  safeSet('vIR', hex4(IR));
  safeSet('vAC', hex4(AC));
  safeSet('vDR', hex4(DR));
  safeSet('vE', E ? '1' : '0');

  ['vPC','vAR','vIR','vAC','vDR','vE'].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.classList.remove('current','flash');
  });

  changed.forEach(c=>{
    const el = document.getElementById('v' + c);
    if (el) { el.classList.add('current'); flashEl(el); setTimeout(()=>el.classList.remove('current'),420); }
  });

  safeSet('cycles', profiler.cycles);
  safeSet('instrs', profiler.instr);
  safeSet('reads', profiler.reads);
  safeSet('writes', profiler.writes);
  safeSet('cpi', profiler.instr ? (profiler.cycles / profiler.instr).toFixed(2) : '0.00');

  renderMemTable();
  renderInstrTable();
}

// -------------------- Render Memory & Instruction Tables --------------------
function renderMemTable() {
  const tbody = document.querySelector('#memtable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const limit = 256;
  for (let i = 0; i < limit; i++) {
    const tr = document.createElement('tr');
    tr.setAttribute('data-addr', i);
    if (i === (PC & 0xFFF)) tr.classList.add('current');
    const td1 = document.createElement('td'); td1.className = 'addr'; td1.textContent = hex3(i);
    const td2 = document.createElement('td'); td2.className = 'val'; td2.textContent = (MEM[i] || '0000');
    tr.appendChild(td1); tr.appendChild(td2); tbody.appendChild(tr);
  }
}

function renderInstrTable() {
  const tbody = document.querySelector('#itable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  for (let i = 0; i < 256; i++) {
    const code = MEM[i] || '0000';
    const val = parseHexTok(code);
    let mnem = 'DATA';
    if (regRefMap[val]) mnem = regRefMap[val];
    else {
      let top = NaN;
      if (code && code.length >= 1) top = parseInt(code[0], 16);
      if (!Number.isNaN(top) && memOpMap[top]) mnem = memOpMap[top] + ' ' + code.slice(1);
    }
    const tr = document.createElement('tr');
    if (i === (PC & 0xFFF)) tr.classList.add('current');
    tr.innerHTML = `<td class="addr">${hex3(i)}</td><td class="val">${code}</td><td>${mnem}</td>`;
    tbody.appendChild(tr);
  }
}

// -------------------- Load program --------------------
document.getElementById('btnLoad').addEventListener('click', () => {
  const file = document.getElementById('file').files[0];
  if (!file) { alert('Select a .txt program file (lines like "000 7800")'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result;
    MEM = new Array(MEM_SIZE).fill('0000');
    text.split(/\r?\n/).forEach(line => {
      const raw = line.trim(); if (!raw) return;
      const parts = raw.split(/\s+|:/).filter(Boolean); if (parts.length < 2) return;
      const addr = parseInt(parts[0], 16); const val = parts[1].toUpperCase().padStart(4, '0');
      if (!Number.isNaN(addr) && addr >= 0 && addr < MEM_SIZE) MEM[addr] = val;
    });
    PC = AR = IR = AC = DR = E = 0; SC = 0; halted = false;
    profiler = { cycles: 0, instr: 0, reads: 0, writes: 0 };
    pushTrace('Program loaded — memory initialized.');
    updateUI(['PC','AR','IR','AC','DR']);
  };
  reader.readAsText(file);
});

// -------------------- Micro-cycle step function --------------------
function handleRegRef(ir) {
  let changed = [];
  const full = ir & 0xFFFF;
  if (regRefMap[full]) {
    const name = regRefMap[full];
    pushTrace(`Register-ref ${name} executed`);
    switch(name){
      case 'CLA': AC = 0; changed.push('AC'); break;
      case 'CLE': E = 0; changed.push('E'); break;
      case 'CMA': AC = (~AC)&0xFFFF; changed.push('AC'); break;
      case 'CME': E ^=1; changed.push('E'); break;
      case 'CIR': { let newE=AC&1; AC=((AC>>1)|(E<<15))&0xFFFF; E=newE; changed.push('AC','E'); } break;
      case 'CIL': { let newE=(AC>>15)&1; AC=(((AC<<1)&0xFFFF)|E)&0xFFFF; E=newE; changed.push('AC','E'); } break;
      case 'INC': AC=(AC+1)&0xFFFF; changed.push('AC'); break;
      case 'SPA': if(((AC>>15)&1)===0){ PC=(PC+1)&0xFFF; changed.push('PC'); } break;
      case 'SNA': if(((AC>>15)&1)===1){ PC=(PC+1)&0xFFF; changed.push('PC'); } break;
      case 'SZA': if(AC===0){ PC=(PC+1)&0xFFF; changed.push('PC'); } break;
      case 'SZE': if(E===0){ PC=(PC+1)&0xFFF; changed.push('PC'); } break;
      case 'HLT': halted=true; pushTrace('HLT executed — machine halted'); changed.push('IR'); break;
    }
  } else {
    // bitwise lower 12 bits
    const b=[]; for(let i=0;i<12;i++)b.push(((IR>>(11-i))&1)===1);
    const [CLA,CLE,CMA,CME,CIR,CIL,INC,SPA,SNA,SZA,SZE,HLT]=b;
    if(CLA){AC=0; changed.push('AC');} if(CLE){E=0; changed.push('E');} if(CMA){AC=(~AC)&0xFFFF; changed.push('AC');}
    if(CME){E^=1; changed.push('E');} if(CIR){let newE=AC&1; AC=((AC>>1)|(E<<15))&0xFFFF; E=newE; changed.push('AC','E');}
    if(CIL){let newE=(AC>>15)&1; AC=(((AC<<1)&0xFFFF)|E)&0xFFFF; E=newE; changed.push('AC','E');} if(INC){AC=(AC+1)&0xFFFF; changed.push('AC');}
    if(SPA&&((AC>>15)&1)===0){PC=(PC+1)&0xFFF; changed.push('PC');} if(SNA&&((AC>>15)&1)===1){PC=(PC+1)&0xFFF; changed.push('PC');}
    if(SZA&&(AC===0)){PC=(PC+1)&0xFFF; changed.push('PC');} if(SZE&&(E===0)){PC=(PC+1)&0xFFF; changed.push('PC');}
    if(HLT){halted=true; changed.push('IR'); pushTrace('HLT executed via bit');}
  }
  updateUI(changed);
}

// micro-step function
function microStep() {
  if (halted){pushTrace('Machine halted.'); return;}
  profiler.cycles++;

  switch(SC){
    case 0: AR=PC; updateUI(['AR']); pushTrace('T0: AR <- PC'); SC=1; break;
    case 1: IR=parseHexTok(MEM[AR]||'0000'); PC=(PC+1)&0xFFF; profiler.reads++; updateUI(['IR','PC']); pushTrace(`T1: IR <- M[AR] (0x${hex4(IR)}), PC <- PC+1`); SC=2; break;
    case 2: SC=3; break;
    case 3:
      const opcodeTop = (IR & 0xF000)>>12; const addrField = IR & 0x0FFF;
      if(opcodeTop===0x7){ handleRegRef(IR); SC=0; profiler.instr++; break;}
      else { AR=addrField; SC=4; pushTrace(`T3: AR <- address(IR) 0x${hex3(AR)}`); updateUI(['AR']); break;}
    case 4:
      const opcodeTop4=(IR&0xF000)>>12; const opName=memOpMap[opcodeTop4]||'UNK';
      highlightMemory(AR,AR);
      const indirect=(IR&0x0800)!==0;
      if(indirect&&opName!=='STA'&&opName!=='BUN'&&opName!=='BSA'){ AR=parseHexTok(MEM[AR]||'0000'); profiler.reads++; pushTrace(`T4a: Indirect AR -> 0x${hex3(AR)}`); SC=5; break;}
      if(opName==='STA'){ MEM[AR]=hex4(AC); profiler.writes++; pushTrace(`T4: M[AR] <- AC (0x${hex4(AC)})`); SC=0; profiler.instr++; updateUI(['DR']); break;}
      else if(opName==='BUN'){ PC=AR; pushTrace('T4: PC <- AR (branch)'); SC=0; profiler.instr++; updateUI(['PC']); break;}
      else if(opName==='BSA'){ MEM[AR]=hex4(PC); profiler.writes++; PC=(AR+1)&0xFFF; pushTrace('T4: BSA write & PC <- AR+1'); SC=0; profiler.instr++; updateUI(['PC']); break;}
      else { DR=parseHexTok(MEM[AR]||'0000'); profiler.reads++; pushTrace(`T4b: DR <- M[AR] 0x${hex4(DR)}`); updateUI(['DR']); SC=5; break;}
    case 5:
      const opcodeTop5=(IR&0xF000)>>12; const opName5=memOpMap[opcodeTop5]||'UNK';
      if(opName5==='AND'){AC&=DR; pushTrace('AC <- AC & DR'); updateUI(['AC']);}
      else if(opName5==='ADD'){let sum=AC+DR; E=(sum>0xFFFF)?1:0; AC=sum&0xFFFF; pushTrace('AC <- AC + DR; E <- carry'); updateUI(['AC','E']);}
      else if(opName5==='LDA'){AC=DR; pushTrace('AC <- DR'); updateUI(['AC']);}
      else if(opName5==='ISZ'){ let v=(DR+1)&0xFFFF; MEM[AR]=hex4(v); profiler.writes++; pushTrace('ISZ: M[AR] <- DR+1'); if(v===0){PC=(PC+1)&0xFFF; pushTrace('ISZ: PC <- PC+1'); updateUI(['PC']);}}
      SC=0; profiler.instr++; break;
  }
}

// -------------------- convenience ops: step / run / halt --------------------
function stepMicroCycle(){ microStep(); updateUI(); }
document.getElementById('btnStep').addEventListener('click',()=>{ if(halted) pushTrace('Machine halted.'); else stepMicroCycle(); });

function nextInstruction(){
  if(halted){pushTrace('Machine halted.'); return;}
  pushTrace('--- next_inst ---');
  let started=false;
  while(true){
    if(halted) break;
    if(SC===0&&started) break;
    microStep(); started=true;
  }
  pushTrace('--- inst complete ---');
  updateUI();
}
document.getElementById('btnInst').addEventListener('click',nextInstruction);

document.getElementById('btnRun').addEventListener('click',()=>{
  if(runTimer) return;
  const speed=Math.max(10,parseInt(document.getElementById('speed').value,10)||400);
  runTimer=setInterval(()=>{
    if(halted){clearInterval(runTimer); runTimer=null; pushTrace('Stopped (halted)'); return;}
    microStep(); updateUI();
  },speed);
});

document.getElementById('btnHalt').addEventListener('click',()=>{
  halted=true; if(runTimer){clearInterval(runTimer); runTimer=null;}
  pushTrace('Execution halted by user.'); updateUI();
});

document.getElementById('btnReset').addEventListener('click',()=>{
  MEM=new Array(MEM_SIZE).fill('0000'); PC=AR=IR=AC=DR=E=0; SC=0; halted=false;
  profiler={cycles:0,instr:0,reads:0,writes:0};
  updateUI(['PC','AR','IR','AC','DR']);
  pushTrace('Simulator reset');
});

// -------------------- CLI handler --------------------
document.getElementById('cliBtn').addEventListener('click',()=>{
  const raw=(document.getElementById('cliInput').value||'').trim();
  const out=document.getElementById('cliOutput'); if(!out) return;
  if(!raw){out.textContent=''; return;}
  const cmd=raw.trim(); const lower=cmd.toLowerCase(); const parts=cmd.split(/\s+/);

  if(/^show\s+(ac|pc|ir|ar|dr|e)$/i.test(cmd)){
    const reg=parts[1].toUpperCase(); let val;
    switch(reg){case 'AC':val=hex4(AC);break; case 'PC':val=hex3(PC);break; case 'IR':val=hex4(IR);break;
      case 'AR':val=hex3(AR);break; case 'DR':val=hex4(DR);break; case 'E':val=E?'1':'0';break;}
    out.textContent=`${reg} = ${val}`; return;
  }
  if(/^show\s+mem/i.test(lower)){
    if(!parts[2]){out.textContent='Usage: show mem <hex-address> [count]'; return;}
    const start=parseInt(parts[2],16); if(isNaN(start)||start<0||start>=MEM_SIZE){out.textContent='Invalid start addr';return;}
    const count=Math.min(MEM_SIZE-start, parts[3]?parseInt(parts[3],10):16);
    let txt=''; for(let i=0;i<count;i++){txt+=hex3(start+i)+': '+(MEM[start+i]||'0000')+'\n';} out.textContent=txt; return;
  }
  out.textContent='Unknown command';
});
