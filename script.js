// script.js
// Full Mano-style CPU simulator - corrected for indirect addressing and buttons

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

// -------------------- UI helpers --------------------
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
  const safeSet = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  };

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
  for (let i = 0; i < 256; i++) {
    const tr = document.createElement('tr');
    tr.setAttribute('data-addr', i);
    if (i === (PC & 0xFFF)) tr.classList.add('current');
    const td1 = document.createElement('td'); td1.className = 'addr'; td1.textContent = hex3(i);
    const td2 = document.createElement('td'); td2.className = 'val'; td2.textContent = (MEM[i] || '0000');
    tr.appendChild(td1);
    tr.appendChild(td2);
    tbody.appendChild(tr);
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
      let top = parseInt(code[0],16);
      if (!isNaN(top) && memOpMap[top]) mnem = memOpMap[top] + ' ' + code.slice(1);
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
  if (!file) { alert('Select a .txt program file'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    MEM = new Array(MEM_SIZE).fill('0000');
    reader.result.split(/\r?\n/).forEach(line=>{
      const raw = line.trim();
      if(!raw) return;
      const parts = raw.split(/\s+|:/).filter(Boolean);
      if(parts.length<2) return;
      const addr = parseInt(parts[0],16);
      const val = parts[1].toUpperCase().padStart(4,'0');
      if(!isNaN(addr) && addr>=0 && addr<MEM_SIZE) MEM[addr]=val;
    });
    PC=AR=IR=AC=DR=E=0; SC=0; halted=false;
    profiler={cycles:0,instr:0,reads:0,writes:0};
    pushTrace('Program loaded — memory initialized.');
    updateUI(['PC','AR','IR','AC','DR']);
  };
  reader.readAsText(file);
});

// -------------------- Micro-step --------------------
function microStep() {
  if (halted) { pushTrace('Machine halted.'); return; }
  profiler.cycles++;

  if (SC===0){ AR=PC; SC=1; updateUI(['AR']); pushTrace('T0: AR <- PC'); return; }
  if (SC===1){ IR=parseHexTok(MEM[AR]||'0000'); PC=(PC+1)&0xFFF; profiler.reads++; SC=2; updateUI(['IR','PC']); pushTrace(`T1: IR <- M[AR], PC+1`); return; }
  if (SC===2){ SC=3; pushTrace(`T2: decode opcode=0x${((IR&0xF000)>>12).toString(16)}, addr=0x${hex3(IR&0x0FFF)}`); return; }

  const opcodeTop=(IR&0xF000)>>12;
  const addrField=IR&0x0FFF;

  if(opcodeTop!==0x7){ // memory-ref
    if(SC===3){ AR=addrField; SC=4; updateUI(['AR']); pushTrace('T3: AR <- addr(IR)'); return; }
    if(SC===4){
      const opName=memOpMap[opcodeTop]||'UNK';
      highlightMemory(AR,AR);
      if(opName==='STA'){ MEM[AR]=hex4(AC); profiler.writes++; SC=0; profiler.instr++; updateUI(['DR']); pushTrace(`T4: M[AR] <- AC`); return; }
      else if(opName==='BUN'){ PC=AR; SC=0; profiler.instr++; updateUI(['PC']); pushTrace('T4: PC <- AR'); return; }
      else if(opName==='BSA'){ MEM[AR]=hex4(PC); profiler.writes++; PC=(AR+1)&0xFFF; SC=0; profiler.instr++; updateUI(['PC']); pushTrace('T4: BSA executed'); return; }
      else { // AND, ADD, LDA, ISZ
        let effectiveAddr = AR;
        const indirect=(IR&0x0800)!==0;
        if(indirect){ effectiveAddr=parseHexTok(MEM[AR]||'0000'); profiler.reads++; pushTrace(`T4a: indirect addr -> 0x${hex3(effectiveAddr)}`);}
        DR=parseHexTok(MEM[effectiveAddr]||'0000'); profiler.reads++; SC=5; updateUI(['DR']); pushTrace(`T4b: DR <- M[0x${hex3(effectiveAddr)}]`); return;
      }
    }
    if(SC===5){
      const opName=memOpMap[opcodeTop]||'UNK';
      if(opName==='AND'){ AC=AC&DR; pushTrace('T5: AC & DR'); updateUI(['AC']); }
      else if(opName==='ADD'){ let sum=AC+DR; E=(sum>0xFFFF)?1:0; AC=sum&0xFFFF; pushTrace('T5: AC+DR'); updateUI(['AC','E']); }
      else if(opName==='LDA'){ AC=DR; pushTrace('T5: AC<-DR'); updateUI(['AC']); }
      else if(opName==='ISZ'){ let v=(DR+1)&0xFFFF; MEM[AR]=hex4(v); profiler.writes++; pushTrace('T5: ISZ increment'); if(v===0){ PC=(PC+1)&0xFFF; pushTrace('PC incremented'); updateUI(['PC']); } }
      SC=0; profiler.instr++; return;
    }
  } else { // reg-ref
    if(SC===3){
      const full=IR&0xFFFF;
      let changed=[];
      if(regRefMap[full]){ 
        const name=regRefMap[full];
        pushTrace(`T3: Register-ref ${name}`);
        switch(name){
          case'CLA':AC=0;changed.push('AC');break;
          case'CLE':E=0;changed.push('E');break;
          case'CMA':AC=(~AC)&0xFFFF;changed.push('AC');break;
          case'CME':E^=1;changed.push('E');break;
          case'CIR':{let newE=AC&1;AC=((AC>>1)|(E<<15))&0xFFFF;E=newE;changed.push('AC');changed.push('E');}break;
          case'CIL':{let newE=(AC>>15)&1;AC=(((AC<<1)&0xFFFF)|E)&0xFFFF;E=newE;changed.push('AC');changed.push('E');}break;
          case'INC':AC=(AC+1)&0xFFFF;changed.push('AC');break;
          case'SPA':if(((AC>>15)&1)===0){PC=(PC+1)&0xFFF;changed.push('PC');}break;
          case'SNA':if(((AC>>15)&1)===1){PC=(PC+1)&0xFFF;changed.push('PC');}break;
          case'SZA':if(AC===0){PC=(PC+1)&0xFFF;changed.push('PC');}break;
          case'SZE':if(E===0){PC=(PC+1)&0xFFF;changed.push('PC');}break;
          case'HLT':halted=true;changed.push('IR');pushTrace('HLT executed');break;
        }
      }
      updateUI(changed); SC=0; profiler.instr++; return;
    }
  }
}

// -------------------- Buttons --------------------
function stepMicroCycle(){ microStep(); updateUI(); }
document.getElementById('btnStep').addEventListener('click', ()=>{ if(halted) pushTrace('Machine halted'); else stepMicroCycle(); });

function nextInstruction(){
  if(halted){ pushTrace('Machine halted'); return; }
  pushTrace('--- next instruction ---');
  let started=false;
  while(true){
    if(halted) break;
    if(SC===0 && started) break;
    microStep();
    started=true;
  }
  pushTrace('--- instruction complete ---');
  updateUI();
}
document.getElementById('btnInst').addEventListener('click', nextInstruction);

document.getElementById('btnRun').addEventListener('click', ()=>{
  if(runTimer) return;
  const speed=Math.max(10,parseInt(document.getElementById('speed').value,10)||400);
  runTimer=setInterval(()=>{
    if(halted){ clearInterval(runTimer); runTimer=null; pushTrace('Stopped'); return; }
    microStep(); updateUI();
  },speed);
});

document.getElementById('btnHalt').addEventListener('click', ()=>{
  halted=true;
  if(runTimer){ clearInterval(runTimer); runTimer=null; }
  pushTrace('Execution halted by user'); updateUI();
});

document.getElementById('btnReset').addEventListener('click', ()=>{
  MEM=new Array(MEM_SIZE).fill('0000');
  PC=AR=IR=AC=DR=E=0; SC=0; halted=false;
  profiler={cycles:0,instr:0,reads:0,writes:0};
  updateUI(['PC','AR','IR','AC','DR']);
  pushTrace('Simulator reset');
});

// -------------------- CLI --------------------
// same CLI code as before...

// -------------------- Initial render --------------------
updateUI();
renderMemTable();
renderInstrTable();
