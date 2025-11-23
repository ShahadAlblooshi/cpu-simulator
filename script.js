// script.js - Full corrected Mano-style CPU simulator with indirect addressing and working buttons

document.addEventListener('DOMContentLoaded', () => {

  // -------------------- Machine state --------------------
  const MEM_SIZE = 1 << 12; // 4096 words
  let MEM = new Array(MEM_SIZE).fill('0000');
  let PC = 0, AR = 0, IR = 0, AC = 0, DR = 0, E = 0;
  let SC = 0; // microcycle step
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
    document.querySelectorAll('#memtable tbody tr').forEach(r => r.classList.remove('highlight'));
    if (typeof start !== 'number' || isNaN(start)) return;
    if (typeof end !== 'number' || isNaN(end)) end = start;
    start = Math.max(0, start); end = Math.min(end, MEM_SIZE - 1);
    const low = Math.max(0, start), high = Math.min(end, 255);
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

    ['vPC','vAR','vIR','vAC','vDR','vE'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('current','flash');
    });

    changed.forEach(c => {
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

  // -------------------- Render tables --------------------
  function renderMemTable() {
    const tbody = document.querySelector('#memtable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    for (let i = 0; i < 256; i++) {
      const tr = document.createElement('tr'); tr.setAttribute('data-addr', i);
      if (i === (PC & 0xFFF)) tr.classList.add('current');
      const td1 = document.createElement('td'); td1.className = 'addr'; td1.textContent = hex3(i);
      const td2 = document.createElement('td'); td2.className = 'val'; td2.textContent = MEM[i] || '0000';
      tr.appendChild(td1); tr.appendChild(td2);
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
        const top = parseInt(code[0],16);
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
      const text = reader.result;
      MEM = new Array(MEM_SIZE).fill('0000');
      text.split(/\r?\n/).forEach(line => {
        const raw = line.trim();
        if (!raw) return;
        const parts = raw.split(/\s+|:/).filter(Boolean);
        if (parts.length < 2) return;
        const addr = parseInt(parts[0],16);
        const val = parts[1].toUpperCase().padStart(4,'0');
        if (!isNaN(addr) && addr>=0 && addr<MEM_SIZE) MEM[addr] = val;
      });
      PC = AR = IR = AC = DR = E = 0; SC = 0; halted=false;
      profiler = { cycles:0,instr:0,reads:0,writes:0 };
      pushTrace('Program loaded.');
      updateUI(['PC','AR','IR','AC','DR']);
    };
    reader.readAsText(file);
  });

  // -------------------- Micro-cycle --------------------
  function microStep() {
    if (halted) { pushTrace('Machine halted.'); return; }
    profiler.cycles++;
    pushTrace(`T${SC}: IR=0x${hex4(IR)}`);

    if (SC===0) { AR=PC; updateUI(['AR']); SC=1; return; }
    if (SC===1) { IR=parseHexTok(MEM[AR]||'0000'); PC=(PC+1)&0xFFF; profiler.reads++; updateUI(['IR','PC']); SC=2; return; }

    const opcodeTop=(IR&0xF000)>>12;
    const addrField=IR&0x0FFF;

    if (opcodeTop!==0x7) { // memory ref
      if (SC===2) { AR=addrField; updateUI(['AR']); SC=3; return; }

      const indirect=(IR&0x0800)!==0;
      let effAddr=AR;
      if (indirect) { effAddr=parseHexTok(MEM[AR]||'0000'); profiler.reads++; pushTrace(`Indirect: AR->0x${hex3(effAddr)}`); }

      if (SC===3) {
        if(memOpMap[opcodeTop]!=='STA'){ // Only read if not STA
          DR=parseHexTok(MEM[effAddr]||'0000');
          profiler.reads++;
          updateUI(['DR']);
        }
        SC=4; return;
      }

      if (SC===4) {
        const op=memOpMap[opcodeTop]||'UNK';
        switch(op) {
          case 'AND': AC=AC&DR; pushTrace('AC<-AC&DR'); updateUI(['AC']); break;
          case 'ADD': { let sum=AC+DR; E=(sum>0xFFFF)?1:0; AC=sum&0xFFFF; pushTrace('AC<-AC+DR;E'); updateUI(['AC','E']); } break;
          case 'LDA': AC=DR; pushTrace('AC<-DR'); updateUI(['AC']); break;
          case 'STA': MEM[effAddr]=hex4(AC); profiler.writes++; pushTrace(`M[${hex3(effAddr)}]<-AC`); updateUI(['DR']); break;
          case 'BUN': PC=effAddr; pushTrace('PC<-AR'); updateUI(['PC']); break;
          case 'BSA': MEM[effAddr]=hex4(PC); profiler.writes++; PC=(effAddr+1)&0xFFF; pushTrace('BSA: save PC, PC<-AR+1'); updateUI(['PC']); break;
          case 'ISZ': { let v=(DR+1)&0xFFFF; MEM[effAddr]=hex4(v); profiler.writes++; if(v===0){PC=(PC+1)&0xFFF; updateUI(['PC']);} pushTrace('ISZ executed'); } break;
          default: pushTrace('Unknown mem-op'); break;
        }
        SC=0; profiler.instr++; return;
      }
    } else { // register ref
      if (SC===2) { 
        const full=IR&0xFFFF;
        let changed=[]; 
        if(regRefMap[full]){ 
          const name=regRefMap[full];
          switch(name){
            case 'CLA': AC=0; changed.push('AC'); break;
            case 'CLE': E=0; changed.push('E'); break;
            case 'CMA': AC=(~AC)&0xFFFF; changed.push('AC'); break;
            case 'CME': E^=1; changed.push('E'); break;
            case 'CIR': { let newE=AC&1; AC=((AC>>1)|(E<<15))&0xFFFF; E=newE; changed.push('AC'); changed.push('E'); } break;
            case 'CIL': { let newE=(AC>>15)&1; AC=(((AC<<1)&0xFFFF)|E)&0xFFFF; E=newE; changed.push('AC'); changed.push('E'); } break;
            case 'INC': AC=(AC+1)&0xFFFF; changed.push('AC'); break;
            case 'SPA': if(((AC>>15)&1)===0){PC=(PC+1)&0xFFF; changed.push('PC');} break;
            case 'SNA': if(((AC>>15)&1)===1){PC=(PC+1)&0xFFF; changed.push('PC');} break;
            case 'SZA': if(AC===0){PC=(PC+1)&0xFFF; changed.push('PC');} break;
            case 'SZE': if(E===0){PC=(PC+1)&0xFFF; changed.push('PC');} break;
            case 'HLT': halted=true; changed.push('IR'); pushTrace('HLT executed'); break;
          }
        }
        updateUI(changed);
        SC=0; profiler.instr++; return;
      }
    }
  }

  // -------------------- Buttons --------------------
  document.getElementById('btnStep').addEventListener('click',()=>{ microStep(); updateUI(); });
  document.getElementById('btnInst').addEventListener('click', ()=>{
    if(halted){ pushTrace('Halted'); return;}
    while(SC!==0 || !halted){ microStep(); if(SC===0) break;}
    updateUI();
  });
  document.getElementById('btnRun').addEventListener('click',()=>{
    if(runTimer) return;
    const speed=Math.max(10, parseInt(document.getElementById('speed').value,10)||400);
    runTimer=setInterval(()=>{
      if(halted){ clearInterval(runTimer); runTimer=null; pushTrace('Stopped'); return;}
      microStep(); updateUI();
    },speed);
  });
  document.getElementById('btnHalt').addEventListener('click',()=>{
    halted=true;
    if(runTimer){ clearInterval(runTimer); runTimer=null;}
    pushTrace('Execution halted');
    updateUI();
  });
  document.getElementById('btnReset').addEventListener('click',()=>{
    MEM=new Array(MEM_SIZE).fill('0000'); PC=AR=IR=AC=DR=E=0; SC=0; halted=false;
    profiler={cycles:0,instr:0,reads:0,writes:0};
    updateUI(['PC','AR','IR','AC','DR']);
    pushTrace('Simulator reset');
  });

  // -------------------- CLI --------------------
  document.getElementById('cliBtn').addEventListener('click',()=>{
    const raw=(document.getElementById('cliInput').value||'').trim();
    const out=document.getElementById('cliOutput');
    if(!out) return;
    if(!raw){ out.textContent=''; return;}
    const cmd=raw.trim().toLowerCase();
    const parts=raw.split(/\s+/);

    if(/^show\s+(ac|pc|ir|ar|dr|e)$/i.test(raw)){
      const reg=parts[1].toUpperCase();
      let val='';
      switch(reg){ case 'AC': val=hex4(AC); break; case 'PC': val=hex3(PC); break; case 'IR': val=hex4(IR); break; case 'AR': val=hex3(AR); break; case 'DR': val=hex4(DR); break; case 'E': val=E? '1':'0'; break; }
      out.textContent=`${reg} = ${val}`;
      return;
    }

    if(/^show\s+mem/i.test(raw)){
      if(!parts[2]){ out.textContent='Usage: show mem <hex> [count]'; return;}
      let start=parseInt(parts[2],16); if(isNaN(start)||start<0||start>=MEM_SIZE){ out.textContent='Invalid address'; return;}
      let count=1; if(parts[3]){ const c=parseInt(parts[3],10); count=(isNaN(c)||c<1)?1:c; }
      let end=Math.min(start+count-1,MEM_SIZE-1);
      highlightMemory(start,end);
      let text=''; for(let i=start;i<=end;i++) text+=`${hex3(i)}: ${MEM[i]||'0000'}\n`;
      out.textContent=text; return;
    }

    if(cmd==='show all'){
      out.textContent=
        `PC = ${hex3(PC)}\nAR = ${hex3(AR)}\nIR = ${hex4(IR)}\nAC = ${hex4(AC)}\nDR = ${hex4(DR)}\nE = ${E}\n\n`+
        `Cycles = ${profiler.cycles}\nInstr = ${profiler.instr}\nReads = ${profiler.reads}\nWrites = ${profiler.writes}\nCPI = ${profiler.instr?(profiler.cycles/profiler.instr).toFixed(2):'0.00'}`;
      return;
    }

    if(cmd==='show profiler'){
      out.textContent=
        `Cycles = ${profiler.cycles}\nInstr = ${profiler.instr}\nReads = ${profiler.reads}\nWrites = ${profiler.writes}\nCPI = ${profiler.instr?(profiler.cycles/profiler.instr).toFixed(2):'0.00'}`;
      return;
    }

    out.textContent='Unknown command';
  });

  // -------------------- Initial render --------------------
  updateUI();
  renderMemTable();
  renderInstrTable();

}); // end DOMContentLoaded
