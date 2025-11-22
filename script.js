const MEM_SIZE = 1<<12;
let MEM = new Array(MEM_SIZE).fill('0000');
let PC=0,AR=0,IR=0,AC=0,DR=0,E=0,SC=0,halted=false;
let profiler={cycles:0,instr:0,reads:0,writes:0};

// -------------------- Memory Render --------------------
function renderMemTable(highlight=[]){
  const tbody=document.querySelector('#memTable tbody');
  tbody.innerHTML='';
  const limit=256;
  for(let i=0;i<limit;i++){
    const tr=document.createElement('tr');
    tr.setAttribute('data-addr',i);
    tr.innerHTML=`<td>${i.toString(16).padStart(3,'0').toUpperCase()}</td><td>${MEM[i]}</td>`;
    if(highlight.includes(i)) tr.classList.add('highlight');
    tbody.appendChild(tr);
  }
}

// -------------------- CLI --------------------
document.getElementById('cliBtn').addEventListener('click',()=>{
  const cmd=document.getElementById('cliInput').value.trim().toLowerCase();
  const out=document.getElementById('cliOutput');

  document.querySelectorAll('#memTable tr').forEach(r=>r.classList.remove('highlight'));

  if(cmd.startsWith('show mem')){
    const parts=cmd.split(/\s+/);
    let start=parseInt(parts[2],16)||0;
    let end=parseInt(parts[3],16)||start;
    start=Math.max(0,start); end=Math.min(MEM_SIZE-1,end);

    let text='';
    const highlight=[];
    for(let i=start;i<=end;i++){
      highlight.push(i);
      text+=`${i.toString(16).padStart(3,'0').toUpperCase()}: ${MEM[i]}\n`;
    }
    renderMemTable(highlight);
    out.textContent=text;
  } else out.textContent='Unknown command';
});

// -------------------- Registers Update --------------------
function updateUI(){
  document.getElementById('vPC').textContent=PC.toString(16).padStart(3,'0').toUpperCase();
  document.getElementById('vAR').textContent=AR.toString(16).padStart(3,'0').toUpperCase();
  document.getElementById('vIR').textContent=IR.toString(16).padStart(4,'0').toUpperCase();
  document.getElementById('vAC').textContent=AC.toString(16).padStart(4,'0').toUpperCase();
  document.getElementById('vDR').textContent=DR.toString(16).padStart(4,'0').toUpperCase();
  document.getElementById('vE').textContent=E;
  document.getElementById('cycles').textContent=profiler.cycles;
  document.getElementById('instrs').textContent=profiler.instr;
  document.getElementById('reads').textContent=profiler.reads;
  document.getElementById('writes').textContent=profiler.writes;
  document.getElementById('cpi').textContent=profiler.instr ? (profiler.cycles/profiler.instr).toFixed(2):'0.00';
}

// -------------------- Load Program --------------------
document.getElementById('btnLoad').addEventListener('click',()=>{
  const file=document.getElementById('file').files[0];
  if(!file){ alert('Select program file'); return; }
  const reader=new FileReader();
  reader.onload=()=>{
    MEM=new Array(MEM_SIZE).fill('0000');
    reader.result.split(/\r?\n/).forEach(line=>{
      const parts=line.trim().split(/\s+/);
      if(parts.length<2) return;
      const addr=parseInt(parts[0],16);
      const val=parts[1].toUpperCase().padStart(4,'0');
      if(addr>=0 && addr<MEM_SIZE) MEM[addr]=val;
    });
    PC=AR=IR=AC=DR=E=SC=0; halted=false;
    profiler={cycles:0,instr:0,reads:0,writes:0};
    renderMemTable(); updateUI();
  };
  reader.readAsText(file);
});

// -------------------- Microstep Example (ADD/AND/STA) --------------------
function microStep(){
  if(halted) return;
  profiler.cycles++;
  AR=PC;
  IR=parseInt(MEM[AR],16);
  PC=(PC+1)&0xFFF;
  profiler.reads++;

  const opcodeTop=(IR&0xF000)>>12;
  const addr=IR&0x0FFF;

  // ADD
  if(opcodeTop===0x1){ DR=parseInt(MEM[addr],16); AC=(AC+DR)&0xFFFF; profiler.instr++; profiler.reads++; }
  // AND
  if(opcodeTop===0x0){ DR=parseInt(MEM[addr],16); AC=AC&DR; profiler.instr++; profiler.reads++; }
  // STA
  if(opcodeTop===0x3){ MEM[addr]=AC.toString(16).padStart(4,'0').toUpperCase(); profiler.instr++; profiler.writes++; }

  renderMemTable([addr]);
  updateUI();


  // highlight selected memory in table
function highlightMemory(start,end){
  const rows = document.querySelectorAll('#memtable tbody tr');
  rows.forEach(r=>r.classList.remove('highlight'));
  for(let i=start;i<=end;i++){
    const row = document.querySelector(`#memtable tbody tr[data-addr="${i}"]`);
    if(row) row.classList.add('highlight');
  }
}

// CLI
document.getElementById('cliBtn').addEventListener('click',()=>{
  const cmd = document.getElementById('cliInput').value.trim().toLowerCase();
  const out = document.getElementById('cliOutput');
  if(cmd.startsWith('show mem')){
    const parts = cmd.split(/\s+/);
    let start = parseInt(parts[2],16)||0;
    let end = parseInt(parts[3],16)||start;
    highlightMemory(start,end);
    let text='';
    for(let i=start;i<=end;i++){
      text += hex3(i)+': '+(MEM[i]||'0000')+'\n';
    }
    out.textContent = text;
  } else { out.textContent='Unknown command'; }
});

}

// -------------------- Initial Render --------------------
renderMemTable();
updateUI();
