// ========================
// Simulator state
// ========================
let totalCycles = 0;
let totalInstructions = 0;
let memoryReads = 0;
let memoryWrites = 0;
let PC = 0;   // Program Counter
let AC = 0;   // Accumulator
let IR = "";  // Instruction Register
let AR = 0;   // Address Register
let DR = 0;   // Data Register
let memory = [];  // Simulated memory
let program = [];  // Loaded program
let currentInstructionIndex = 0;

// ========================
// Define instructions with cycle/memory info
// ========================
const instructions = [
  { name: "LOAD", cycles: 2, memRead: 1, memWrite: 0 },
  { name: "STORE", cycles: 3, memRead: 0, memWrite: 1 },
  { name: "ADD", cycles: 1, memRead: 1, memWrite: 0 },
  { name: "SUB", cycles: 1, memRead: 1, memWrite: 0 }
];

// ========================
// Populate table initially
// ========================
function renderTable() {
  const tbody = document.querySelector("#instrTable tbody");
  tbody.innerHTML = "";
  instructions.forEach((instr, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${instr.name}</td>
      <td>${instr.cycles}</td>
      <td>${instr.memRead}</td>
      <td>${instr.memWrite}</td>
    `;
    if (index === currentInstructionIndex) row.classList.add("current");
    tbody.appendChild(row);
  });
}

// ========================
// Update dashboard stats
// ========================
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


// ========================
// Execute a single instruction
// ========================
function executeInstruction() {
  if (program.length === 0) {
    alert("No program loaded!");
    return;
  }

  if (PC >= program.length) {
    alert("Program finished!");
    return;
  }

  IR = program[PC];  // fetch instruction
  totalInstructions++;

  const parts = IR.split(" ");
  const opcode = parts[0].toUpperCase();
  const operand = parseInt(parts[1] || 0);

  switch(opcode) {
    case "LOAD":
      AR = operand;
      DR = memory[AR] || 0;
      AC = DR;
      totalCycles += 2;
      memoryReads += 1;
      break;
    case "STORE":
      AR = operand;
      memory[AR] = AC;
      totalCycles += 3;
      memoryWrites += 1;
      break;
    case "ADD":
      AR = operand;
      DR = memory[AR] || 0;
      AC += DR;
      totalCycles += 1;
      memoryReads += 1;
      break;
    case "SUB":
      AR = operand;
      DR = memory[AR] || 0;
      AC -= DR;
      totalCycles += 1;
      memoryReads += 1;
      break;
    default:
      console.log("Unknown instruction:", IR);  IR = instructions[currentInstructionIndex].name;
  PC = currentInstructionIndex;   // update PC
  AR = Math.floor(Math.random() * 10); // just example
  DR = AC;                        // example
  AC += 1;                         // example increment

  totalCycles += instructions[currentInstructionIndex].cycles;
  totalInstructions += 1;
  memoryReads += instructions[currentInstructionIndex].memRead;
  memoryWrites += instructions[currentInstructionIndex].memWrite;

  currentInstructionIndex = (currentInstructionIndex + 1) % instructions.length;
  renderTable();
  updateStats();

  
  }

  PC++;
  currentInstructionIndex = instructions.findIndex(instr => instr.name === opcode);
  renderTable();
  updateStats();
}

// ========================
// Event listeners for buttons
// ========================
document.getElementById("nextInstruction").addEventListener("click", executeInstruction);

document.getElementById("fastInstruction").addEventListener("click", () => {
  for (let i = 0; i < 20; i++) executeInstruction();
});

document.getElementById("nextCycle").addEventListener("click", () => {
  totalCycles += 1;
  updateStats();
});

document.getElementById("fastCycle").addEventListener("click", () => {
  totalCycles += 10;
  updateStats();
});

document.getElementById("run").addEventListener("click", () => {
  const interval = setInterval(() => {
    executeInstruction();
    if (PC >= program.length) clearInterval(interval);
  }, 200);
});

// ========================
// Load program from file
// ========================
function loadProgram() {
  const fileInput = document.getElementById("programFile");
  const file = fileInput.files[0];
  
  if (!file) {
    alert("Please select a file!");
    return;
  }

  const reader = new FileReader();
  
  reader.onload = function(e) {
    const text = e.target.result;
    program = text.split("\n").map(line => line.trim()).filter(line => line !== "");
    PC = 0;
    totalCycles = 0;
    totalInstructions = 0;
    memoryReads = 0;
    memoryWrites = 0;
    AC = 0; IR = ""; AR = 0; DR = 0;
    console.log("Program loaded:", program);
    alert("Program loaded successfully!");
    updateStats();
  };
  
  reader.readAsText(file);
}

// ========================
// Initial render
// ========================
renderTable();
updateStats();
