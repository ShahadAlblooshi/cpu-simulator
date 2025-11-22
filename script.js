// -------------------- CPU State --------------------
const MEM_SIZE = 1 << 12; // 4096 words
let MEM = new Array(MEM_SIZE).fill('0000'); // hex strings
let PC = 0, AR = 0, IR = 0, AC = 0, DR = 0, E = 0;
let SC = 0; // microcycle state
let halted = false;
let profiler = { cycles:0, instr:0, reads:0, writes:0 };
let runTimer = null;

// -------------------- Instruction maps --------------------
const regRefMap = {
  0x7800: 'CLA', 0x7400: 'CLE', 0x7200: 'CMA', 0x7100: 'CME',
  0x7080: 'CIR', 0x7040: 'CIL', 0x7020: 'INC', 0x7010: 'SPA',
  0x7008: 'SNA', 0x7004: 'SZA', 0x7002: 'SZE', 0x7001: 'HLT'
};
const memOpMap = {
  0x0:'AND',0x1:'ADD',0x2:'LDA',0x3:'STA',0x4:'BUN',0x5:'BSA',0x6:'ISZ'
};

// -------------------- Helpers --------------------
function hex4(n){return (n&0xFFFF).toString(16).toUpperCase().padStart(4,'0');}
function hex3(n){return (n&0xFFF).toString(16).toUpperCase().padStart(3,'0');}
function parseHexTok(s){return parseInt(s,16);}
function flashEl(el){ if(!el) return; el.classList.add('flash'); setTimeout(()=>el.classList.remove('flash'),480);}
function pushTrace(line){ const t=document.getElementById('trace'); t.textContent=line+'\n'+t.textContent;}

// -------------------- UI Update --------------------
function updateUI(changed=[]){
  document.getElementById('vPC').textContent = hex3(PC);
  document.getElementById('vAR').textContent = hex3(AR);
  document.getElementById('vIR').textContent = hex4(IR);
  document.getElementById('vAC').textContent = hex4(AC);
  document.getElementById('vDR').textContent = hex4(DR);
  document.getElementById('vE').textContent = E?'1':'0';

  ['vPC','vAR','vIR','vAC','vDR','vE'].forEach(id=>{
    const el=document.getElementById(id); el.classList.remove('current','flash');
  });
  changed.forEach(c=>{
    const el=document.getElementById('v'+c);
    if(el){el.classList.add('current'); flashEl(el);}
  });

  document.getElementById('cycles').textContent = profiler.cycles;
  document.getElementById('instrs').textContent = profiler.instr;
  document.getElementById('reads').textContent = profiler.reads;
  document.getElementById('writes').textContent = profiler.writes;
  document.getElementById('cpi').textContent = profiler.instr?(profiler.cycles/profiler.instr).toFixed(2):'0.00';

  renderMemTable();
  renderInstrTable();
}

// -------------------- Memory & Instruction Tables --------------------
function renderMemTable(){
  const tbody=document.querySelector('#memtable tbody'); tbody.innerHTML='';
  const limit=256;
  for(let i=0;i<limit;i++){
    const tr=document.createElement('tr'); if(i===PC) tr.classList.add('current');
    tr.setAttribute('data-addr',i);
    tr.innerHTML=`<td>${hex3(i)}</td><td>${MEM[i]}</td>`;
    tbody.appendChild(tr);
  }
}

function renderInstrTable(){
  const tbody=document.querySelector('#itable tbody'); tbody.innerHTML='';
  for(let i=0;i<256;i++){
    const code=MEM[i]||'0000';
    let mnem='DATA';
    const val=parseHexTok(code);
    if(regRefMap[val]) mnem=regRefMap[val];
    else {
      const top=parseInt(code[0],16);
      if(memOpMap[top]) mnem=memOpMap[top]+' '+code.slice(1);
    }
    const tr=document.createElement('tr'); if(i===PC) tr.classList.add('current');
    tr.innerHTML=`<td>${hex3(i)}</td><td>${code}</td><td>${mnem}</td>`;
    tbody.appendChild(tr);
  }
}

// -------------------- Program Load --------------------
document.getElementById('btnLoad').addEventListener('click',()=>{
  const file=document.getElementById('file').files[0];
  if(!file){ alert('Select a .txt program file'); return; }
  const reader=new FileReader();
  reader.onload=()=>{
    MEM=new Array(MEM_SIZE).fill('0000');
    reader.result.split(/\r?\n/).forEach(line=>{
      line=line.trim(); if(!line) return;
      const parts=line.split(/\s+/); if(parts.length<2) return;
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

// -------------------- CLI --------------------
document.getElementById('cliBtn').addEventListener('click',()=>{
  const cmd=document.getElementById('cliInput').value.trim().toLowerCase();
  const out=document.getElementById('cliOutput');
  const memTable=document.getElementById('memtable');
  memTable.querySelectorAll('tr').forEach(row=>row.classList.remove('highlight'));

  if(cmd.startsWith('show mem')){
    const parts=cmd.split(/\s+/);
    let start=parseInt(parts[2],16)||0;
    let end=parseInt(parts[3],16)||start+15;
    start=Math.max(0,start); end=Math.min(MEM_SIZE-1,end);

    for(let i=start;i<=end;i++){
      const row=memTable.querySelector(`tr[data-addr="${i}"]`);
      if(row) row.classList.add('highlight');
    }

    let text='';
    for(let i=start;i<=end;i++) text+=hex3(i)+': '+MEM[i]+'\n';
    out.textContent=text;
  } else {
    out.textContent='Unknown command';
  }
});

// -------------------- Microcycle Execution --------------------
function microStep(){ /* full microcycle logic (unchanged from your script.js) */ }
function stepMicroCycle(){ microStep(); updateUI(); }
document.getElementById('btnStep').addEventListener('click',()=>{ if(halted) pushTrace('Machine halted.'); else stepMicroCycle(); });
function nextInstruction(){
  if(halted){ pushTrace('Machine halted.'); return; }
  pushTrace('--- next_inst ---'); let started=false;
  while(true){ if(halted) break; if(SC===0 && started) break; microStep(); started=true; }
  pushTrace('--- inst complete ---'); updateUI();
}
document.getElementById('btnInst').addEventListener('click',nextInstruction);
document.getElementById('btnRun').addEventListener('click',()=>{
  if(runTimer) return; const speed=parseInt(document.getElementById('speed').value,10);
  runTimer=setInterval(()=>{
    if(halted){ clearInterval(runTimer); runTimer=null; pushTrace('Stopped (halted)'); return; }
    microStep(); updateUI();
  },speed);
});
document.getElementById('btnHalt').addEventListener('click',()=>{
  halted=true; if(runTimer){ clearInterval(runTimer); runTimer=null; }
  pushTrace('Execution halted by user.'); updateUI();
});
document.getElementById('btnReset').addEventListener('click',()=>{
  MEM=new Array(MEM_SIZE).fill('0000'); PC=AR=IR=AC=DR=E=0; SC=0; halted=false;
  profiler={cycles:0,instr:0,reads:0,writes:0};
  updateUI(['PC','AR','IR','AC','DR']); pushTrace('Simulator reset');
});

// -------------------- Initial Render --------------------
updateUI();
