// Custom Hex CPU Simulator (register-ref codes begin with 7xxx)
// Save this as script.js and open index.html

// -------------------- Machine state --------------------
const MEM_SIZE = 1 << 12; // 4096 words (12-bit addresses)
let MEM = new Array(MEM_SIZE).fill('0000'); // hex strings
let PC = 0, AR = 0, IR = 0, AC = 0, DR = 0, E = 0;
let SC = 0; // microcycle state
let halted = false;

let profiler = { cycles: 0, instr: 0, reads: 0, writes: 0 };

// run control
let runTimer = null;

// -------------------- Instruction maps --------------------
// Register-reference hex codes (exact values)
const regRefMap = {
  0x7800: 'CLA',
  0x7400: 'CLE',
  0x7200: 'CMA',
  0x7100: 'CME',
  0x7080: 'CIR',
  0x7040: 'CIL',
  0x7020: 'INC',
  0x7010: 'SPA',
  0x7008: 'SNA',
  0x7004: 'SZA',
  0x7002: 'SZE',
  0x7001: 'HLT'
};

// Memory-reference opcodes by top nibble (hex first digit)
const memOpMap = {
  0x0: 'AND',
  0x1: 'ADD',
  0x2: 'LDA',
  0x3: 'STA',
  0x4: 'BUN',
  0x5: 'BSA',
  0x6: 'ISZ'
};

// -------------------- Helpers --------------------
function hex4(n) { return (n & 0xFFFF).toString(16).toUpperCase().padStart(4,'0'); }
function hex3(n) { return (n & 0xFFF).toString(16).toUpperCase().padStart(3,'0'); }
function parseHexTok(s){ return parseInt(s,16); }

// UI helpers
function flashEl(el) { if(!el) return; el.classList.add('flash'); setTimeout(()=>el.classList.remove('flash'),480); }
function pushTrace(line){ const t = document.getElementById('trace'); t.textContent = line + '\n' + t.textContent; }

// update UI registers & stats
function updateUI(changed=[]) {
  document.getElementById('vPC').textContent = hex3(PC);
  document.getElementById('vAR').textContent = hex3(AR);
  document.getElementById('vIR').textContent = hex4(IR);
  document.getElementById('vAC').textContent = hex4(AC);
  document.getElementById('vDR').textContent = hex4(DR);
  document.getElementById('vE').textContent = E ? '1' : '0';

  ['vPC','vAR','vIR','vAC','vDR','vE'].forEach(id=>{
    const el = document.getElementById(id);
    el.classList.remove('current','flash');
  });
  changed.forEach(c=>{
    const id = 'v' + c;
    const el = document.getElementById(id);
    if(el){ el.classList.add('current'); flashEl(el); setTimeout(()=>el.classList.remove('current'),420); }
  });

  document.getElementById('cycles').textContent = profiler.cycles;
  document.getElementById('instrs').textContent = profiler.instr;
  document.getElementById('reads').textContent = profiler.reads;
  document.getElementById('writes').textContent = profiler.writes;
  document.getElementById('cpi').textContent = profiler.instr ? (profiler.cycles / profiler.instr).toFixed(2) : '0.00';

  renderMemTable();
  renderInstrTable();
}

// render memory table (first 256 words for performance)
function renderMemTable() {
  const tbody = document.querySelector('#memtable tbody');
  tbody.innerHTML = '';
  const limit = 256;
  for(let i=0;i<limit;i++){
    const tr = document.createElement('tr');
    if(i === PC) tr.classList.add('current');
    const td1 = document.createElement('td'); td1.className='addr'; td1.textContent = hex3(i);
    const td2 = document.createElement('td'); td2.className='val'; td2.textContent = MEM[i] || '0000';
    tr.appendChild(td1); tr.appendChild(td2);
    tbody.appendChild(tr);
  }
}

// render instruction table (decoded)
function renderInstrTable() {
  const tbody = document.querySelector('#itable tbody');
  tbody.innerHTML = '';
  // show first 256 addresses for readability
  for(let i=0;i<256;i++){
    const code = MEM[i] || '0000';
    const val = parseHexTok(code);
    let mnem = 'DATA';
    // if register-ref exact match
    if(regRefMap[val]) mnem = regRefMap[val];
    else {
      const top = parseInt(code[0],16);
      if(memOpMap[top]) mnem = memOpMap[top] + ' ' + code.slice(1);
    }
    const tr = document.createElement('tr');
    if(i===PC) tr.classList.add('current');
    tr.innerHTML = `<td class="addr">${hex3(i)}</td><td class="val">${code}</td><td>${mnem}</td>`;
    tbody.appendChild(tr);
  }
}

// -------------------- Load program (file) --------------------
document.getElementById('btnLoad').addEventListener('click', () => {
  const file = document.getElementById('file').files[0];
  if(!file){ alert('Select a .txt program file (lines: "000 7800")'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result;
    MEM = new Array(MEM_SIZE).fill('0000');
    text.split(/\r?\n/).forEach(line=>{
      line = line.trim();
      if(!line) return;
      const parts = line.split(/\s+/);
      if(parts.length < 2) return;
      const addr = parseInt(parts[0],16);
      const val  = parts[1].toUpperCase().padStart(4,'0');
      if(!Number.isNaN(addr) && addr >=0 && addr < MEM_SIZE) MEM[addr] = val;
    });
    PC = 0; AR=0; IR=0; AC=0; DR=0; E=0; SC=0; halted=false;
    profiler = { cycles:0, instr:0, reads:0, writes:0 };
    pushTrace('Program loaded — memory initialized.');
    updateUI(['PC','AR','IR','AC','DR']);
  };
  reader.readAsText(file);
});
document.getElementById('cliBtn').addEventListener('click', ()=>{
  const cmd = document.getElementById('cliInput').value.trim();
  const out = document.getElementById('cliOutput');
  if(cmd.startsWith('show mem')){
    const parts = cmd.split(/\s+/);
    let start = parseInt(parts[2],16)||0;
    let end   = parseInt(parts[3],16)||start+15;
    let text = '';
    for(let i=start;i<=end;i++){
      text += hex3(i) + ': ' + (MEM[i]||'0000') + '\n';
    }
    out.textContent = text;
  } else {
    out.textContent = 'Unknown command';
  }
});

// -------------------- Micro-cycle step function --------------------
function microStep() {
  if(halted) { pushTrace('Machine halted.'); return; }
  profiler.cycles++;
  pushTrace(`T${SC}: IR=0x${hex4(IR)}`);

  // T0: AR <- PC
  if(SC === 0){
    AR = PC;
    updateUI(['AR']);
    pushTrace('T0: AR <- PC');
    SC = 1;
    return;
  }

  // T1: IR <- M[AR]; PC <- PC+1
  if(SC === 1){
    const addr = AR & 0xFFF;
    IR = parseHexTok(MEM[addr] || '0000');
    PC = (PC + 1) & 0xFFF;
    profiler.reads++;
    updateUI(['IR','PC']);
    pushTrace(`T1: IR <- M[AR] (0x${hex4(IR)}), PC <- PC+1`);
    SC = 2;
    return;
  }

  // T2: decode
  if(SC === 2){
    const opcodeTop = (IR & 0xF000) >> 12;
    const addr = IR & 0x0FFF;
    pushTrace(`T2: decode opcode_top=0x${opcodeTop.toString(16)} addr=0x${hex3(addr)}`);
    // determine next
    if(opcodeTop === 0x7){
      // register-ref - execute at T3
      SC = 3;
    } else {
      // memory-ref - proceed
      SC = 3;
    }
    return;
  }

  // SC >= 3 : execute-phase
  const opcodeTop = (IR & 0xF000) >> 12;
  const addr = IR & 0x0FFF;
  const irHex = hex4(IR);

  // Memory-reference instructions (opcodeTop != 7)
  if(opcodeTop !== 0x7){
    // T3: AR <- address(IR)
    if(SC === 3){
      AR = addr;
      updateUI(['AR']);
      pushTrace('T3: AR <- address(IR)');
      SC = 4;
      return;
    }
    // T4: read or write depending on opcode
    if(SC === 4){
      const opName = memOpMap[opcodeTop] || 'UNK';
      if(opName === 'STA'){
        // write AC to M[AR]
        MEM[AR] = hex4(AC);
        profiler.writes++;
        updateUI(['DR']);
        pushTrace(`T4: M[AR] <- AC (write ${hex4(AC)})`);
        SC = 0; profiler.instr++; return;
      } else if(opName === 'BUN'){
        PC = AR;
        pushTrace('T4: PC <- AR (branch)');
        updateUI(['PC']);
        SC = 0; profiler.instr++; return;
      } else if(opName === 'BSA'){
        MEM[AR] = hex4(PC);
        profiler.writes++;
        PC = (AR + 1) & 0xFFF;
        pushTrace(`T4: M[AR] <- PC; PC <- AR+1`);
        updateUI(['PC']);
        SC = 0; profiler.instr++; return;
      } else {
        // read for AND, ADD, LDA, ISZ
        DR = parseHexTok(MEM[AR] || '0000');
        profiler.reads++;
        updateUI(['DR']);
        pushTrace(`T4: DR <- M[AR] (0x${hex4(DR)})`);
        SC = 5;
        return;
      }
    }
    // T5: final
    if(SC === 5){
      const opName = memOpMap[opcodeTop] || 'UNK';
      if(opName === 'AND'){
        AC = AC & DR;
        pushTrace('T5: AC <- AC & DR');
        updateUI(['AC']);
      } else if(opName === 'ADD'){
        let sum = AC + DR;
        E = (sum > 0xFFFF) ? 1 : 0;
        AC = sum & 0xFFFF;
        pushTrace('T5: AC <- AC + DR ; E<-carry');
        updateUI(['AC','E']);
      } else if(opName === 'LDA'){
        AC = DR;
        pushTrace('T5: AC <- DR');
        updateUI(['AC']);
      } else if(opName === 'ISZ'){
        let v = (DR + 1) & 0xFFFF;
        MEM[AR] = hex4(v);
        profiler.writes++;
        pushTrace('T5: M[AR] <- DR+1');
        if(v === 0){
          PC = (PC + 1) & 0xFFF;
          pushTrace('T5b: PC <- PC+1 (DR==0)');
          updateUI(['PC']);
        }
      } else {
        pushTrace('T5: unhandled mem-op');
      }
      SC = 0; profiler.instr++; return;
    }
  } else {
    // Register-reference (opcodeTop == 7). Execute at T3 (single micro-op)
    if(SC === 3){
      // IR is full 16-bit value. Check exact 16-bit matches or bit mask for individual bits.
      const full = IR & 0xFFFF;
      let changed = [];
      // match full codes first (common single-bit masked values)
      // We'll test bits as in Mano: full bits 4..15 map to ops
      const bits = (IR & 0x0FFF); // lower 12 bits
      // Instead of bit positions confusion, check exact values in regRefMap:
      if(regRefMap[full]){
        const name = regRefMap[full];
        pushTrace(`T3: Register-ref ${name} executed`);
        switch(name){
          case 'CLA': AC = 0; changed.push('AC'); break;
          case 'CLE': E = 0; changed.push('E'); break;
          case 'CMA': AC = (~AC) & 0xFFFF; changed.push('AC'); break;
          case 'CME': E = E ^ 1; changed.push('E'); break;
          case 'CIR': { let newE = AC & 1; AC = ((AC >> 1) | (E << 15)) & 0xFFFF; E = newE; changed.push('AC'); changed.push('E'); } break;
          case 'CIL': { let newE = (AC >> 15) & 1; AC = (((AC << 1) & 0xFFFF) | E) & 0xFFFF; E = newE; changed.push('AC'); changed.push('E'); } break;
          case 'INC': AC = (AC + 1) & 0xFFFF; changed.push('AC'); break;
          case 'SPA': if(((AC >> 15) & 1) === 0){ PC = (PC + 1)&0xFFF; changed.push('PC'); } break;
          case 'SNA': if(((AC >> 15) & 1) === 1){ PC = (PC + 1)&0xFFF; changed.push('PC'); } break;
          case 'SZA': if((AC & 0xFFFF) === 0){ PC = (PC + 1)&0xFFF; changed.push('PC'); } break;
          case 'SZE': if(E === 0){ PC = (PC + 1)&0xFFF; changed.push('PC'); } break;
          case 'HLT': halted = true; pushTrace('HLT executed — machine halted'); changed.push('IR'); break;
        }
      } else {
        // For flexibility: check bitwise mapping in lower 12 bits as single-bit flags.
        // We'll implement bit checks matching the standard mapping (positions 11..0)
        const b = [];
        for(let i=0;i<12;i++) b.push( ((IR >> (11-i)) & 1) === 1 ); // b[0] = bit4 etc
        // mapping per earlier message:
        const CLA = b[0], CLE = b[1], CMA = b[2], CME = b[3], CIR = b[4], CIL = b[5], INC = b[6], SPA = b[7], SNA = b[8], SZA = b[9], SZE = b[10], HLT = b[11];
        if(CLA){ AC=0; changed.push('AC'); }
        if(CLE){ E=0; changed.push('E'); }
        if(CMA){ AC=(~AC)&0xFFFF; changed.push('AC'); }
        if(CME){ E = E^1; changed.push('E'); }
        if(CIR){ let newE=AC&1; AC=((AC>>1)|(E<<15))&0xFFFF; E=newE; changed.push('AC'); changed.push('E'); }
        if(CIL){ let newE=(AC>>15)&1; AC=(((AC<<1)&0xFFFF)|E)&0xFFFF; E=newE; changed.push('AC'); changed.push('E'); }
        if(INC){ AC=(AC+1)&0xFFFF; changed.push('AC'); }
        if(SPA && ((AC>>15)&1)===0){ PC=(PC+1)&0xFFF; changed.push('PC'); }
        if(SNA && ((AC>>15)&1)===1){ PC=(PC+1)&0xFFF; changed.push('PC'); }
        if(SZA && (AC===0)){ PC=(PC+1)&0xFFF; changed.push('PC'); }
        if(SZE && (E===0)){ PC=(PC+1)&0xFFF; changed.push('PC'); }
        if(HLT){ halted=true; changed.push('IR'); pushTrace('HLT executed via bit'); }
      }

      updateUI(changed);
      SC = 0; profiler.instr++;
      return;
    }
  }
}

// -------------------- convenience ops: step instruction / run / halt --------------------
function stepMicroCycle(){ microStep(); updateUI(); }

document.getElementById('btnStep').addEventListener('click', ()=>{ if(halted) pushTrace('Machine halted.'); else stepMicroCycle(); });

// next instruction: run microcycles until SC returns to 0 (instruction complete)
function nextInstruction(){
  if(halted){ pushTrace('Machine halted.'); return; }
  pushTrace('--- next_inst ---');
  let started=false;
  while(true){
    if(halted) break;
    if(SC===0 && started) break;
    microStep();
    started=true;
  }
  pushTrace('--- inst complete ---');
  updateUI();
}
document.getElementById('btnInst').addEventListener('click', nextInstruction);

// run continuously (microcycle speed from slider)
document.getElementById('btnRun').addEventListener('click', ()=>{
  if(runTimer) return;
  const speed = parseInt(document.getElementById('speed').value,10);
  runTimer = setInterval(()=>{
    if(halted){ clearInterval(runTimer); runTimer=null; pushTrace('Stopped (halted)'); return; }
    microStep();
    updateUI();
  }, speed);
});

// halt button
document.getElementById('btnHalt').addEventListener('click', ()=>{
  halted = true;
  if(runTimer){ clearInterval(runTimer); runTimer=null; }
  pushTrace('Execution halted by user.');
  updateUI();
});

// reset
document.getElementById('btnReset').addEventListener('click', ()=>{
  MEM = new Array(MEM_SIZE).fill('0000');
  PC=AR=IR=AC=DR=E=0; SC=0; halted=false;
  profiler = { cycles:0, instr:0, reads:0, writes:0 };
  updateUI(['PC','AR','IR','AC','DR']);
  pushTrace('Simulator reset');
});

// -------------------- initial render --------------------
updateUI();
renderMemTable();
renderInstrTable();
