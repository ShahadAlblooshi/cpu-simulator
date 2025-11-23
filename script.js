// -------------------- Machine state --------------------
const MEM_SIZE = 1 << 12; // 4096 words
let MEM = new Array(MEM_SIZE).fill('0000');
let PC = 0, AR = 0, IR = 0, AC = 0, DR = 0, E = 0;
let SC = 0; // microcycle
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
const parseHexTok = s => parseInt(s, 16);
function flashEl(el) { if (!el) return; el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 480); }
function pushTrace(line) { const t = document.getElementById('trace'); if (t) t.textContent = line + '\n' + t.textContent; }

// -------------------- UI helpers --------------------
function highlightMemory(start, end) {
  // clear previous highlights
  document.querySelectorAll('#memtable tbody tr').forEach(r => r.classList.remove('highlight'));
  // clamp and highlight
  start = Math.max(0, start || 0);
  end = Math.min( (typeof end === 'number' ? end : start), 255 );
  for (let i = start; i <= end; i++) {
    const row = document.querySelector(`#memtable tr[data-addr="${i}"]`);
    if (row) row.classList.add('highlight');
  }
}

// -------------------- Update UI --------------------
function updateUI(changed = []) {
  const el = id => document.getElementById(id);
  if (el('vPC')) el('vPC').textContent = hex3(PC);
  if (el('vAR')) el('vAR').textContent = hex3(AR);
  if (el('vIR')) el('vIR').textContent = hex4(IR);
  if (el('vAC')) el('vAC').textContent = hex4(AC);
  if (el('vDR')) el('vDR').textContent = hex4(DR);
  if (el('vE')) el('vE').textContent = E ? '1' : '0';

  ['vPC','vAR','vIR','vAC','vDR','vE'].forEach(id => {
    const e = document.getElementById(id);
    if (e) e.classList.remove('current','flash');
  });
  changed.forEach(c => {
    const e = document.getElementById('v' + c);
    if (e) { e.classList.add('current'); flashEl(e); setTimeout(()=>e.classList.remove('current'),420); }
  });

  if (el('cycles')) el('cycles').textContent = profiler.cycles;
  if (el('instrs')) el('instrs').textContent = profiler.instr;
  if (el('reads')) el('reads').textContent = profiler.reads;
  if (el('writes')) el('writes').textContent = profiler.writes;
  if (el('cpi')) el('cpi').textContent = profiler.instr ? (profiler.cycles / profiler.instr).toFixed(2) : '0.00';

  renderMemTable();
  renderInstrTable();
}

// -------------------- Render Memory --------------------
function renderMemTable() {
  const tbody = document.querySelector('#memtable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  for (let i = 0; i < 256; i++) {
    const tr = document.createElement('tr');
    tr.setAttribute('data-addr', i);
    if (i === PC) tr.classList.add('current');
    tr.innerHTML = `<td class="addr">${hex3(i)}</td><td class="val">${MEM[i]}</td>`;
    tbody.appendChild(tr);
  }
}

// -------------------- Render Instructions --------------------
function renderInstrTable() {
  const tbody = document.querySelector('#itable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  for (let i = 0; i < 256; i++) {
    const code = MEM[i] || '0000';
    const val = parseHexTok(code || '0000');
    let mnem = 'DATA';
    if (regRefMap[val]) mnem = regRefMap[val];
    else {
      // safe parse: if code is not a hex string, fallback
      const top = code && code.length ? parseInt(code[0], 16) : NaN;
      if (!Number.isNaN(top) && memOpMap[top]) mnem = memOpMap[top] + ' ' + code.slice(1);
    }
    const tr = document.createElement('tr');
    if (i === PC) tr.classList.add('current');
    tr.innerHTML = `<td class="addr">${hex3(i)}</td><td class="val">${code}</td><td>${mnem}</td>`;
    tbody.appendChild(tr);
  }
}

// -------------------- Load Program --------------------
document.getElementById('btnLoad').addEventListener('click', () => {
  const file = document.getElementById('file').files[0];
  if (!file) { alert('Select a .txt program file'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result;
    MEM = new Array(MEM_SIZE).fill('0000');
    text.split(/\r?\n/).forEach(line => {
      line = line.trim();
      if (!line) return;
      const parts = line.split(/\s+/);
      if (parts.length < 2) return;
      const addr = parseInt(parts[0], 16);
      const val = parts[1].toUpperCase().padStart(4, '0');
      if (!Number.isNaN(addr) && addr >= 0 && addr < MEM_SIZE) MEM[addr] = val;
    });
    PC = AR = IR = AC = DR = E = 0; SC = 0; halted = false;
    profiler = { cycles: 0, instr: 0, reads: 0, writes: 0 };
    pushTrace('Program loaded — memory initialized.');
    updateUI(['PC','AR','IR','AC','DR']);
  };
  reader.readAsText(file);
});

// -------------------- MicroStep --------------------
function microStep() {
  if (halted) { pushTrace('Machine halted.'); return; }
  profiler.cycles++;
  pushTrace(`T${SC}: IR=0x${hex4(IR)}`);

  if (SC === 0) { AR = PC; updateUI(['AR']); pushTrace('T0: AR <- PC'); SC = 1; return; }
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
  if (SC === 2) {
    const opcodeTop = (IR & 0xF000) >> 12;
    const addr = IR & 0x0FFF;
    pushTrace(`T2: decode opcode_top=0x${opcodeTop.toString(16)} addr=0x${hex3(addr)}`);
    SC = 3;
    return;
  }

  // execute-phase
  const opcodeTop = (IR & 0xF000) >> 12;
  const addr = IR & 0x0FFF;

  if (opcodeTop !== 0x7) { // memory-reference
    if (SC === 3) { AR = addr; updateUI(['AR']); pushTrace('T3: AR <- address(IR)'); SC = 4; return; }
    if (SC === 4) {
      const opName = memOpMap[opcodeTop] || 'UNK';

      // highlight accessed memory row (only first 256 rows are rendered)
      document.querySelectorAll('#memtable tr').forEach(r => r.classList.remove('highlight'));
      const memRow = document.querySelector(`#memtable tr[data-addr="${AR}"]`);
      if (memRow) memRow.classList.add('highlight');

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
  } else { // register-reference
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
        // bitwise mapping fallback (lower 12 bits)
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

// -------------------- Controls --------------------
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
  const speed = parseInt(document.getElementById('speed').value, 10);
  runTimer = setInterval(() => {
    if (halted) { clearInterval(runTimer); runTimer = null; pushTrace('Stopped (halted)'); return; }
    microStep(); updateUI();
  }, speed);
});
document.getElementById('btnHalt').addEventListener('click', () => { halted = true; if (runTimer) { clearInterval(runTimer); runTimer = null; } pushTrace('Execution halted'); updateUI(); });

document.getElementById('btnReset').addEventListener('click', () => {
  MEM = new Array(MEM_SIZE).fill('0000'); PC = AR = IR = AC = DR = E = 0; SC = 0; halted = false;
  profiler = { cycles: 0, instr: 0, reads: 0, writes: 0 };
  updateUI(['PC','AR','IR','AC','DR']); pushTrace('Simulator reset');
});

// -------------------- CLI (single robust handler) --------------------
document.getElementById('cliBtn').addEventListener('click', () => {
  const raw = document.getElementById('cliInput').value || '';
  const cmd = raw.trim();
  const lower = cmd.toLowerCase();
  const out = document.getElementById('cliOutput');

  if (!cmd) { out.textContent = ''; return; }

  // show <reg>
  if (/^show\s+(ac|pc|ir|ar|dr|e)$/i.test(cmd)) {
    const reg = cmd.split(/\s+/)[1].toUpperCase();
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

  // show mem <hex> [count]
  if (/^show\s+mem/i.test(lower)) {
    const parts = cmd.split(/\s+/);
    if (!parts[2]) { out.textContent = 'Usage: show mem <hex-address> [count]'; return; }
    const start = parseInt(parts[2], 16);
    if (isNaN(start)) { out.textContent = 'Invalid hex address'; return; }
    const count = parts[3] ? parseInt(parts[3], 10) : 1;
    const end = Math.min(start + count - 1, MEM_SIZE - 1);

    // highlight and display
    highlightMemory(start, end);

    let text = '';
    for (let i = start; i <= end; i++) {
      text += `${hex3(i)}: ${ (MEM[i] || '0000') }\n`;
    }
    out.textContent = text;
    return;
  }

  // show all
  if (lower === 'show all') {
    let text =
      `PC = ${hex3(PC)}\nAR = ${hex3(AR)}\nIR = ${hex4(IR)}\nAC = ${hex4(AC)}\nDR = ${hex4(DR)}\nE  = ${E}\n\n` +
      `Cycles = ${profiler.cycles}\nInstructions = ${profiler.instr}\nReads = ${profiler.reads}\nWrites = ${profiler.writes}\nCPI = ${profiler.instr ? (profiler.cycles / profiler.instr).toFixed(2) : '0.00'}`;
    out.textContent = text;
    return;
  }

  // show profiler
  if (lower === 'show profiler') {
    out.textContent =
      `Cycles = ${profiler.cycles}\nInstructions = ${profiler.instr}\nReads = ${profiler.reads}\nWrites = ${profiler.writes}\nCPI = ${profiler.instr ? (profiler.cycles / profiler.instr).toFixed(2) : '0.00'}`;
    return;
  }

  out.textContent = 'Unknown command';
});

// -------------------- Initial Render --------------------
updateUI();
renderMemTable();
renderInstrTable();
