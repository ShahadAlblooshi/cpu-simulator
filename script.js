 // script.js
// Full Mano-style CPU simulator - complete file
// Drop-in replacement for your existing script.js

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

// Highlight memory rows in the rendered memory table (only first 256 shown)
// start/end are numeric addresses (base 10). This function clamps safely.
function highlightMemory(start, end) {
  // Remove previous highlights
  document.querySelectorAll('#memtable tbody tr').forEach(r => r.classList.remove('highlight'));

  if (typeof start !== 'number' || isNaN(start)) return;
  if (typeof end !== 'number' || isNaN(end)) end = start;

  // clamp range
  start = Math.max(0, start);
  end = Math.min(end, MEM_SIZE - 1);

  // Only rows 0..255 are rendered; highlight those in range
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

  // remove previous 'current' markers
  ['vPC','vAR','vIR','vAC','vDR','vE'].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.classList.remove('current','flash');
  });

  // flash the changed registers
  changed.forEach(c=>{
    const el = document.getElementById('v' + c);
    if (el) { el.classList.add('current'); flashEl(el); setTimeout(()=>el.classList.remove('current'),420); }
  });

  // profiler stats
  safeSet('cycles', profiler.cycles);
  safeSet('instrs', profiler.instr);
  safeSet('reads', profiler.reads);
  safeSet('writes', profiler.writes);
  safeSet('cpi', profiler.instr ? (profiler.cycles / profiler.instr).toFixed(2) : '0.00');

  // re-render tables (memory + decoded instructions)
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
      // safe parse top nibble
      let top = NaN;
      if (code && code.length >= 1) {
        top = parseInt(code[0], 16);
      }
      if (!Number.isNaN(top) && memOpMap[top]) mnem = memOpMap[top] + ' ' + code.slice(1);
    }
    const tr = document.createElement('tr');
    if (i === (PC & 0xFFF)) tr.classList.add('current');
    tr.innerHTML = `<td class="addr">${hex3(i)}</td><td class="val">${code}</td><td>${mnem}</td>`;
    tbody.appendChild(tr);
  }
}

// -------------------- Load program (file) --------------------
document.getElementById('btnLoad').addEventListener('click', () => {
  const file = document.getElementById('file').files[0];
  if (!file) { alert('Select a .txt program file (lines like "000 7800")'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result;
    MEM = new Array(MEM_SIZE).fill('0000');
    text.split(/\r?\n/).forEach(line => {
      const raw = line.trim();
      if (!raw) return;
      // accept "000 7800" or "000:7800"
      const parts = raw.split(/\s+|:/).filter(Boolean);
      if (parts.length < 2) return;
      const addr = parseInt(parts[0], 16);
      const val = parts[1].toUpperCase().padStart(4, '0');
      if (!Number.isNaN(addr) && addr >= 0 && addr < MEM_SIZE) MEM[addr] = val;
    });
    // reset CPU state (but keep UI)
    PC = AR = IR = AC = DR = E = 0; SC = 0; halted = false;
    profiler = { cycles: 0, instr: 0, reads: 0, writes: 0 };
    pushTrace('Program loaded — memory initialized.');
    updateUI(['PC','AR','IR','AC','DR']);
  };
  reader.readAsText(file);
});

// -------------------- Micro-cycle step function --------------------
function microStep() {
  if (halted) { pushTrace('Machine halted.'); return; }
  profiler.cycles++;
  pushTrace(`T${SC}: IR=0x${hex4(IR)}`);

  // T0: AR <- PC
  if (SC === 0) {
    AR = PC;
    updateUI(['AR']);
    pushTrace('T0: AR <- PC');
    SC = 1;
    return;
  }

  // T1: IR <- M[AR]; PC <- PC+1
  if (SC === 1) {
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
  if (SC === 2) {
    const opcodeTop = (IR & 0xF000) >> 12;
    const addr = IR & 0x0FFF;
    pushTrace(`T2: decode opcode_top=0x${opcodeTop.toString(16)} addr=0x${hex3(addr)}`);
    SC = 3;
    return;
  }

  // execute-phase (SC >= 3)
  const opcodeTop = (IR & 0xF000) >> 12;
  const addrField = IR & 0x0FFF;

  if (opcodeTop !== 0x7) {
    // memory-reference instructions
    if (SC === 3) {
      AR = addrField;
      updateUI(['AR']);
      pushTrace('T3: AR <- address(IR)');
      SC = 4;
      return;
    }
    if (SC === 4) {
      const opName = memOpMap[opcodeTop] || 'UNK';

      // highlight accessed memory (only if in rendered range)
      highlightMemory(AR, AR);

      if (opName === 'STA') {
        MEM[AR] = hex4(AC);
        profiler.writes++;
        updateUI(['DR']);
        pushTrace(`T4: M[AR] <- AC (write ${hex4(AC)})`);
        SC = 0; profiler.instr++; return;
      } else if (opName === 'BUN') {
        PC = AR;
        pushTrace('T4: PC <- AR (branch)');
        updateUI(['PC']);
        SC = 0; profiler.instr++; return;
      } else if (opName === 'BSA') {
        MEM[AR] = hex4(PC);
        profiler.writes++;
        PC = (AR + 1) & 0xFFF;
        pushTrace(`T4: M[AR] <- PC; PC <- AR+1`);
        updateUI(['PC']);
        SC = 0; profiler.instr++; return;
      } else {
        // read for AND/ADD/LDA/ISZ
        DR = parseHexTok(MEM[AR] || '0000');
        profiler.reads++;
        updateUI(['DR']);
        pushTrace(`T4: DR <- M[AR] (0x${hex4(DR)})`);
        SC = 5;
        return;
      }
    }
    if (SC === 5) {
      const opName = memOpMap[opcodeTop] || 'UNK';
      if (opName === 'AND') {
        AC = AC & DR;
        pushTrace('T5: AC <- AC & DR');
        updateUI(['AC']);
      } else if (opName === 'ADD') {
        let sum = AC + DR;
        E = (sum > 0xFFFF) ? 1 : 0;
        AC = sum & 0xFFFF;
        pushTrace('T5: AC <- AC + DR ; E<-carry');
        updateUI(['AC','E']);
      } else if (opName === 'LDA') {
        AC = DR;
        pushTrace('T5: AC <- DR');
        updateUI(['AC']);
      } else if (opName === 'ISZ') {
        let v = (DR + 1) & 0xFFFF;
        MEM[AR] = hex4(v);
        profiler.writes++;
        pushTrace('T5: M[AR] <- DR+1');
        if (v === 0) {
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
    // register-reference instructions
    if (SC === 3) {
      const full = IR & 0xFFFF;
      let changed = [];

      if (regRefMap[full]) {
        const name = regRefMap[full];
        pushTrace(`T3: Register-ref ${name} executed`);
        switch (name) {
          case 'CLA': AC = 0; changed.push('AC'); break;
          case 'CLE': E = 0; changed.push('E'); break;
          case 'CMA': AC = (~AC) & 0xFFFF; changed.push('AC'); break;
          case 'CME': E = E ^ 1; changed.push('E'); break;
          case 'CIR': { let newE = AC & 1; AC = ((AC >> 1) | (E << 15)) & 0xFFFF; E = newE; changed.push('AC'); changed.push('E'); } break;
          case 'CIL': { let newE = (AC >> 15) & 1; AC = (((AC << 1) & 0xFFFF) | E) & 0xFFFF; E = newE; changed.push('AC'); changed.push('E'); } break;
          case 'INC': AC = (AC + 1) & 0xFFFF; changed.push('AC'); break;
          case 'SPA': if (((AC >> 15) & 1) === 0) { PC = (PC + 1) & 0xFFF; changed.push('PC'); } break;
          case 'SNA': if (((AC >> 15) & 1) === 1) { PC = (PC + 1) & 0xFFF; changed.push('PC'); } break;
          case 'SZA': if ((AC & 0xFFFF) === 0) { PC = (PC + 1) & 0xFFF; changed.push('PC'); } break;
          case 'SZE': if (E === 0) { PC = (PC + 1) & 0xFFF; changed.push('PC'); } break;
          case 'HLT': halted = true; pushTrace('HLT executed — machine halted'); changed.push('IR'); break;
        }
      } else {
        // bitwise mapping (lower 12 bits)
        const b = [];
        for (let i = 0; i < 12; i++) b.push(((IR >> (11 - i)) & 1) === 1);
        const CLA = b[0], CLE = b[1], CMA = b[2], CME = b[3], CIR = b[4], CIL = b[5], INC = b[6], SPA = b[7], SNA = b[8], SZA = b[9], SZE = b[10], HLT = b[11];
        if (CLA) { AC = 0; changed.push('AC'); }
        if (CLE) { E = 0; changed.push('E'); }
        if (CMA) { AC = (~AC) & 0xFFFF; changed.push('AC'); }
        if (CME) { E = E ^ 1; changed.push('E'); }
        if (CIR) { let newE = AC & 1; AC = ((AC >> 1) | (E << 15)) & 0xFFFF; E = newE; changed.push('AC'); changed.push('E'); }
        if (CIL) { let newE = (AC >> 15) & 1; AC = (((AC << 1) & 0xFFFF) | E) & 0xFFFF; E = newE; changed.push('AC'); changed.push('E'); }
        if (INC) { AC = (AC + 1) & 0xFFFF; changed.push('AC'); }
        if (SPA && ((AC >> 15) & 1) === 0) { PC = (PC + 1) & 0xFFF; changed.push('PC'); }
        if (SNA && ((AC >> 15) & 1) === 1) { PC = (PC + 1) & 0xFFF; changed.push('PC'); }
        if (SZA && (AC === 0)) { PC = (PC + 1) & 0xFFF; changed.push('PC'); }
        if (SZE && (E === 0)) { PC = (PC + 1) & 0xFFF; changed.push('PC'); }
        if (HLT) { halted = true; changed.push('IR'); pushTrace('HLT executed via bit'); }
      }

      updateUI(changed);
      SC = 0; profiler.instr++;
      return;
    }
  }
}

// -------------------- convenience ops: step instruction / run / halt --------------------
function stepMicroCycle() { microStep(); updateUI(); }
document.getElementById('btnStep').addEventListener('click', () => { if (halted) pushTrace('Machine halted.'); else stepMicroCycle(); });

function nextInstruction() {
  if (halted) { pushTrace('Machine halted.'); return; }
  pushTrace('--- next_inst ---');
  let started = false;
  while (true) {
    if (halted) break;
    if (SC === 0 && started) break;
    microStep();
    started = true;
  }
  pushTrace('--- inst complete ---');
  updateUI();
}
document.getElementById('btnInst').addEventListener('click', nextInstruction);

document.getElementById('btnRun').addEventListener('click', () => {
  if (runTimer) return;
  const speed = Math.max(10, parseInt(document.getElementById('speed').value, 10) || 400);
  runTimer = setInterval(() => {
    if (halted) { clearInterval(runTimer); runTimer = null; pushTrace('Stopped (halted)'); return; }
    microStep();
    updateUI();
  }, speed);
});

document.getElementById('btnHalt').addEventListener('click', () => {
  halted = true;
  if (runTimer) { clearInterval(runTimer); runTimer = null; }
  pushTrace('Execution halted by user.');
  updateUI();
});

document.getElementById('btnReset').addEventListener('click', () => {
  MEM = new Array(MEM_SIZE).fill('0000');
  PC = AR = IR = AC = DR = E = 0; SC = 0; halted = false;
  profiler = { cycles: 0, instr: 0, reads: 0, writes: 0 };
  updateUI(['PC','AR','IR','AC','DR']);
  pushTrace('Simulator reset');
});

// -------------------- CLI (single robust handler) --------------------
document.getElementById('cliBtn').addEventListener('click', () => {
  const raw = (document.getElementById('cliInput').value || '').trim();
  const out = document.getElementById('cliOutput');
  if (!out) return;
  if (!raw) { out.textContent = ''; return; }

  const cmd = raw.trim();
  const lower = cmd.toLowerCase();
  const parts = cmd.split(/\s+/);

  // show <reg>
  if (/^show\s+(ac|pc|ir|ar|dr|e)$/i.test(cmd)) {
    const reg = parts[1].toUpperCase();
    let val;
    switch (reg) {
      case 'AC': val = hex4(AC); break;
      case 'PC': val = hex3(PC); break;
      case 'IR': val = hex4(IR); break;
      case 'AR': val = hex3(AR); break;
      case 'DR': val = hex4(DR); break;
      case 'E': val = E ? '1' : '0'; break;
    }
    out.textContent = `${reg} = ${val}`;
    return;
  }

  // show mem <hex-address> [count]
  if (/^show\s+mem/i.test(lower)) {
    if (!parts[2]) { out.textContent = 'Usage: show mem <hex-address> [count]'; return; }
    const start = parseInt(parts[2], 16);
    if (isNaN(start) || start < 0 || start >= MEM_SIZE) { out.textContent = 'Invalid hex address'; return; }
    let count = 1;
    if (parts[3]) {
      // count is decimal by default
      const c = parseInt(parts[3], 10);
      count = (!isNaN(c) && c > 0) ? c : 1;
    }
    const end = Math.min(start + count - 1, MEM_SIZE - 1);

    // highlight rendered rows and show text
    highlightMemory(start, end);

    let text = '';
    for (let i = start; i <= end; i++) text += `${hex3(i)}: ${MEM[i] || '0000'}\n`;
    out.textContent = text;
    return;
  }

  // show all
  if (lower === 'show all') {
    out.textContent =
      `PC = ${hex3(PC)}\nAR = ${hex3(AR)}\nIR = ${hex4(IR)}\nAC = ${hex4(AC)}\nDR = ${hex4(DR)}\nE  = ${E}\n\n` +
      `Cycles = ${profiler.cycles}\nInstructions = ${profiler.instr}\nReads = ${profiler.reads}\nWrites = ${profiler.writes}\nCPI = ${profiler.instr ? (profiler.cycles / profiler.instr).toFixed(2) : '0.00'}`;
    return;
  }

  // show profiler
  if (lower === 'show profiler') {
    out.textContent =
      `Cycles = ${profiler.cycles}\nInstructions = ${profiler.instr}\nReads = ${profiler.reads}\nWrites = ${profiler.writes}\nCPI = ${profiler.instr ? (profiler.cycles / profiler.instr).toFixed(2) : '0.00'}`;
    return;
  }

  // run/step/reset via CLI
  if (lower === 'run') { document.getElementById('btnRun').click(); out.textContent = 'Running (via CLI)'; return; }
  if (lower === 'step') { document.getElementById('btnStep').click(); out.textContent = 'Step (microcycle)'; return; }
  if (lower === 'next') { document.getElementById('btnInst').click(); out.textContent = 'Next instruction'; return; }
  if (lower === 'halt') { document.getElementById('btnHalt').click(); out.textContent = 'Halted'; return; }
  if (lower === 'reset') { document.getElementById('btnReset').click(); out.textContent = 'Reset'; return; }

  out.textContent = 'Unknown command';
});

// -------------------- initial render --------------------
updateUI();
renderMemTable();
renderInstrTable();                                         this my html:<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Mano-style CPU Simulator</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>

<header>
  <h1>Mano-style CPU Simulator</h1>
</header>

<main>
  <div class="controls">
    <input type="file" id="file" />
    <button id="btnLoad">Load Program</button>
    <button id="btnStep">Step Micro</button>
    <button id="btnInst">Next Instruction</button>
    <button id="btnRun">Run</button>
    <button id="btnHalt">Halt</button>
    <button id="btnReset">Reset</button>
    <label>Speed(ms)<input type="number" id="speed" value="400" /></label>
  </div>

  <div class="toprow">
    <div class="panel regs">
      <div class="regrow"><span class="label">PC</span><span class="regval" id="vPC">000</span></div>
      <div class="regrow"><span class="label">AR</span><span class="regval" id="vAR">000</span></div>
      <div class="regrow"><span class="label">IR</span><span class="regval" id="vIR">0000</span></div>
      <div class="regrow"><span class="label">AC</span><span class="regval" id="vAC">0000</span></div>
      <div class="regrow"><span class="label">DR</span><span class="regval" id="vDR">0000</span></div>
      <div class="regrow"><span class="label">E</span><span class="regval" id="vE">0</span></div>
    </div>

    <div class="panel stats">
      <div>Cycles: <span id="cycles">0</span></div>
      <div>Instructions: <span id="instrs">0</span></div>
      <div>Reads: <span id="reads">0</span></div>
      <div>Writes: <span id="writes">0</span></div>
      <div>CPI: <span id="cpi">0.00</span></div>
    </div>

    <div class="panel trace">
      <pre id="trace"></pre>
    </div>
  </div>

  <div class="meminstr">
    <div class="panel memory">
      <table id="memtable">
        <thead><tr><th>Addr</th><th>Value</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <div class="panel itable">
      <table id="itable">
        <thead><tr><th>Addr</th><th>Code</th><th>Instruction</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </div>

  <div class="cli">
    <input type="text" id="cliInput" placeholder="Enter command" />
    <button id="cliBtn">Run</button>
    <div id="cliOutput"></div>
  </div>
</main>

<footer>Mano-style CPU Simulator</footer>
<script src="script.js"></script>
</body>
</html>                  this is my css: :root{
  --bg:#0b1220;
  --card:#071026;
  --accent:#60e1d1;
  --muted:#7b8ca3;
  --highlight:#ffd166;
}

*{box-sizing:border-box}
html,body{
  height:100%;
  margin:0;
  background:linear-gradient(180deg,#071026 0%, #0f1b2a 100%);
  color:#dff6f1;
  font-family:Inter,Segoe UI,Roboto,monospace;
}

header{
  padding:18px;
  text-align:center;
}

h1{
  margin:0;
  font-size:26px;
  color:var(--accent);
}

main{
  padding:16px;
  max-width:1100px;
  margin:0 auto;
}

.controls{
  display:flex;
  gap:8px;
  align-items:center;
  flex-wrap:wrap;
  margin-bottom:14px;
}

.controls input[type=file]{
  background:#0a2830;
  padding:8px;
  border-radius:8px;
  border:1px solid rgba(255,255,255,0.04);
  color:var(--accent);
}

.controls button{
  background:var(--accent);
  color:#042;
  border:0;
  padding:10px 12px;
  border-radius:8px;
  cursor:pointer;
  font-weight:700;
}

.controls button:hover{ filter:brightness(.95); }

.controls label{ color:var(--muted); font-size:13px; margin-left:6px; }

.toprow{
  display:flex;
  gap:12px;
  align-items:flex-start;
  margin-bottom:12px;
  flex-wrap:wrap;
}

.panel{
  background:linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));
  padding:12px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,0.03);
  box-shadow:0 6px 24px rgba(2,6,12,0.6);
}

.regs,.stats,.trace{ flex:1; min-width:260px; }

.regrow{
  display:flex;
  justify-content:space-between;
  padding:6px 0;
  border-bottom:1px dashed rgba(255,255,255,0.02);
}

.regrow .label{ color:var(--muted); }
.regval{
  font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
  background:#02121a;
  padding:6px 8px;
  border-radius:6px;
  border:1px solid rgba(255,255,255,0.02);
}
.regval.small{ font-size:90%; }

.stats div{ padding:6px 0; color:var(--muted); }

.trace pre{
  height:120px;
  overflow:auto;
  background:#020b10;
  padding:8px;
  border-radius:8px;
  color:#bfeeea;
  margin:0;
}

.cli{ margin-top:10px; }
#cliInput{
  padding:6px;
  border-radius:6px;
  border:1px solid rgba(255,255,255,0.1);
  width:300px;
  background:#02121a;
  color:var(--accent);
}
#cliBtn{
  padding:6px 10px;
  margin-left:6px;
  border-radius:6px;
  background:var(--accent);
  color:#042;
  cursor:pointer;
  border:0;
  font-weight:700;
}
#cliOutput{
  background:#020b10;
  color:#bfeeea;
  padding:6px;
  border-radius:6px;
  margin-top:6px;
  max-height:120px;
  overflow:auto;
}

.meminstr{ display:flex; gap:12px; align-items:flex-start; flex-wrap:wrap; }
.memory,.itable{ flex:1; min-width:300px; max-height:420px; overflow:auto; }

table{ width:100%; border-collapse:collapse; }
th,td{
  padding:8px;
  border-bottom:1px solid rgba(255,255,255,0.03);
  text-align:left;
  font-family:ui-monospace,monospace;
  font-size:13px;
}

thead th{
  background:linear-gradient(90deg,#072b2e,#08303a);
  color:var(--accent);
  position:sticky;
  top:0;
}

tbody tr:hover{ background:rgba(255,255,255,0.02); }

.addr{ color:var(--muted); width:80px; }
.val{ font-weight:700; color:#dff6f1; }

.current{
  outline:3px solid rgba(255,209,102,0.25);
  background:linear-gradient(90deg, rgba(255,209,102,0.06), transparent);
}

.highlight{ background:rgba(255,209,102,0.3); }

.flash{
  animation:flash 480ms ease;
}
@keyframes flash{
  0%{ transform:translateY(-2px); box-shadow:0 6px 18px rgba(96,225,209,0.18); }
  100%{ transform:none; box-shadow:none; }
}

footer{
  max-width:1100px;
  margin:18px auto;
  text-align:center;
  color:var(--muted);
  font-size:13px;
}
