// Simulator state
let PC = 0, AC = 0, DR = 0, AR = 0, IR = "";
let totalCycles = 0, totalInstructions = 0, memoryReads = 0, memoryWrites = 0;
let program = [];
let memory = [];

// Instruction set with IR mapping
const instructionSet = {
  "LOAD": { cycles: 2, memRead: 1, memWrite: 0, IRcode: "0001" },
  "STORE": { cycles: 3, memRead: 0, memWrite: 1, IRcode: "0010" },
  "ADD": { cycles: 1, memRead: 0, memWrite: 0, IRcode: "0011" },
  "SUB": { cycles: 1, memRead: 0, memWrite: 0, IRcode: "0100" }
};

// Update registers and stats
function updateDashboard() {
  document.getElementById("PC").innerText = PC;
  document.getElementById("AC").innerText = AC;
  document.getElementById("IR").innerText = IR || "---";
  document.getElementById("AR").innerText = AR;
  document.getElementById("DR").innerText = DR;

  document.getElementById("totalCycles").innerText = totalCycles;
  document.getElementById("totalInstructions").innerText = totalInstructions;
  document.getElementById("cpi").innerText = totalInstructions === 0 ? 0 : (totalCycles / totalInstructions).toFixed(2);
  document.getElementById("memoryReads").innerText = memoryReads;
  document.getElementById("memoryWrites").innerText = memoryWrites;

  renderMemory();
}

// Render memory table
function renderMemory() {
  const tbody = document.getElementById("memoryBody");
  tbody.innerHTML = "";
  for(let addr=0; addr<memory.length; addr++) {
    if(memory[addr] !== undefined){
      const row = document.createElement("tr");
      row.innerHTML = `<td>${addr}</td><td>${memory[addr]}</td>`;
      tbody.appendChild(row);
    }
  }
}

// Execute a single instruction
function executeInstruction() {
  if(PC >= program.length) return;

  let line = program[PC];
  let [opcode, operand] = line.split(" ");
  operand = parseInt(operand);

  if(!instructionSet[opcode]) {
    alert(`Unknown instruction at line ${PC}: ${line}`);
    PC++;
    return;
  }

  const instr = instructionSet[opcode];
  IR = instr.IRcode;
  AR = operand || 0;

  switch(opcode) {
    case "LOAD":
      AC = memory[AR] || 0;
      DR = AC;
      totalCycles += instr.cycles;
      memoryReads += instr.memRead;
      break;
    case "STORE":
      memory[AR] = AC;
      DR = AC;
      totalCycles += instr.cycles;
      memoryWrites += instr.memWrite;
      break;
    case "ADD":
      AC += operand;
      DR = AC;
      totalCycles += instr.cycles;
      break;
    case "SUB":
      AC -= operand;
      DR = AC;
      totalCycles += instr.cycles;
      break;
  }

  totalInstructions++;
  PC++;
  updateDashboard();
}

// Load program from file
function loadProgram() {
  const fileInput = document.getElementById("programFile");
  const file = fileInput.files[0];
  if(!file) { alert("Select a program file!"); return; }

  const reader = new FileReader();
  reader.onload = function(e) {
    program = e.target.result.split("\n").map(line => line.trim()).filter(line=>line);
    PC = 0; AC = 0; DR = 0; AR = 0; IR = "";
    totalCycles = 0; totalInstructions = 0; memoryReads = 0; memoryWrites = 0;
    memory = [];
    updateDashboard();
    alert("Program loaded successfully!");
  }
  reader.readAsText(file);
}

// Event listeners
document.getElementById("nextInstruction").addEventListener("click", executeInstruction);

document.getElementById("runProgram").addEventListener("click", () => {
  const interval = setInterval(() => {
    if(PC >= program.length) { clearInterval(interval); return; }
    executeInstruction();
  }, 300);
});

// Initial render
updateDashboard();
