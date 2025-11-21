// Simulator state
let totalCycles = 0;
let totalInstructions = 0;
let memoryReads = 0;
let memoryWrites = 0;

let PC = 0;   // Program Counter
let AC = 0;   // Accumulator
let IR = "";  // Instruction Register
let AR = 0;   // Address Register
let DR = 0;   // Data Register
let memory = [];

let program = [];
let currentInstructionIndex = 0;

// Define instructions
const instructions = [
  { name: "LOAD", cycles: 2, memRead: 1, memWrite: 0 },
  { name: "STORE", cycles: 3, memRead: 0, memWrite: 1 },
  { name: "ADD", cycles: 1, memRead: 0, memWrite: 0 },
  { name: "SUB", cycles: 1, memRead: 0, memWrite: 0 }
];

// Update dashboard stats
function updateStats() {
  document.getElementById("totalCycles").innerText = totalCycles;
  document.getElementById("totalInstructions").innerText = totalInstructions;
  document.getElementById("cpi").innerText = totalInstructions === 0 ? 0 : (totalCycles / totalInstructions).toFixed(2);
  document.getElementById("memoryReads").innerText = memoryReads;
  document.getElementById("memoryWrites").innerText = memoryWrites;

  // Update registers
  document.getElementById("PC").innerText = PC;
  document.getElementById("AC").innerText = AC;
  document.getElementById("IR").innerText = IR;
  document.getElementById("AR").innerText = AR;
  document.getElementById("DR").innerText = DR;
}

// Execute a single instruction
function executeInstruction() {
  if (!program.length) {
    alert("Load a program first!");
    return;
  }

  if (PC >= program.length) return;

  IR = program[PC];  // fetch
  const parts = IR.split(" ");
  const opcode = parts[0];
  const operand = parseInt(parts[1]);

  AR = operand;

  switch (opcode) {
    case "LOAD":
      AC = memory[AR] || 0;
      totalCycles += 2;
      memoryReads += 1;
      break;
    case "STORE":
      memory[AR] = AC;
      totalCycles += 3;
      memoryWrites += 1;
      break;
    case "ADD":
      AC += operand;
      totalCycles += 1;
      break;
    case "SUB":
      AC -= operand;
      totalCycles += 1;
      break;
  }

  DR = AC;
  totalInstructions++;
  PC++;

  updateStats();
}

// Load program from file
function loadProgram() {
  const fileInput = document.getElementById("programFile");
  const file = fileInput.files[0];
  
  if (!file) {
    alert("Select a file!");
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    program = e.target.result.split("\n").map(line => line.trim()).filter(line => line);
    PC = 0;
    AC = 0;
    IR = "";
    AR = 0;
    DR = 0;
    memory = [];
    totalCycles = 0;
    totalInstructions = 0;
    memoryReads = 0;
    memoryWrites = 0;
    updateStats();
    alert("Program loaded!");
  };
  reader.readAsText(file);
}

// Event listeners
document.getElementById("nextInstruction").addEventListener("click", executeInstruction);

document.getElementById("run").addEventListener("click", () => {
  const interval = setInterval(() => {
    executeInstruction();
    if (PC >= program.length) clearInterval(interval);
  }, 200);
});

// Initial stats
updateStats();
