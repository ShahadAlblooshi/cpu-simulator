// CPU Simulator State
let PC = 0;
let AC = 0;
let IR = "";
let AR = 0;
let DR = 0;
let memory = [];
let totalCycles = 0;
let totalInstructions = 0;
let memoryReads = 0;
let memoryWrites = 0;
let program = [];
let running = false;

// Custom Opcode Table
const instructionSet = {
  "7800": { name: "CLA", cycles: 1, memRead: 0, memWrite: 0 },
  "7400": { name: "CLE", cycles: 1, memRead: 0, memWrite: 0 },
  "7200": { name: "CMA", cycles: 1, memRead: 0, memWrite: 0 },
  "7100": { name: "CME", cycles: 1, memRead: 0, memWrite: 0 },
  "7080": { name: "CIR", cycles: 1, memRead: 0, memWrite: 0 },
  "7040": { name: "CIL", cycles: 1, memRead: 0, memWrite: 0 },
  "7020": { name: "INC", cycles: 1, memRead: 0, memWrite: 0 },
  "7010": { name: "SPA", cycles: 1, memRead: 0, memWrite: 0 },
  "7008": { name: "SNA", cycles: 1, memRead: 0, memWrite: 0 },
  "7004": { name: "SZA", cycles: 1, memRead: 0, memWrite: 0 },
  "7002": { name: "SZE", cycles: 1, memRead: 0, memWrite: 0 },
  "7001": { name: "HLT", cycles: 1, memRead: 0, memWrite: 0 }
};

// Load Program
document.getElementById("loadProgram").addEventListener("click", () => {
  const fileInput = document.getElementById("programFile");
  const file = fileInput.files[0];
  if (!file) { alert("Please select a program file!"); return; }

  const reader = new FileReader();
  reader.onload = (e) => {
    const lines = e.target.result.split("\n").map(l => l.trim()).filter(l => l !== "");
    program = lines.map(l => l.split(" ")[1].toUpperCase());
    memory = [...program];
    PC = AC = AR = DR = 0;
    IR = "";
    totalCycles = totalInstructions = memoryReads = memoryWrites = 0;
    running = false;
    updateRegisters();
    updateStats();
    renderTable();
    alert("Program loaded!");
  };
  reader.readAsText(file);
});

// Update Registers Display
function updateRegisters() {
  document.getElementById("PC").innerText = PC;
  document.getElementById("AC").innerText = AC;
  document.getElementById("IR").innerText = IR;
  document.getElementById("AR").innerText = AR;
  document.getElementById("DR").innerText = DR;
}

// Update Stats
function updateStats() {
  document.getElementById("totalCycles").innerText = totalCycles;
  document.getElementById("totalInstructions").innerText = totalInstructions;
  document.getElementById("cpi").innerText = totalInstructions === 0 ? 0 : (totalCycles/totalInstructions).toFixed(2);
  document.getElementById("memoryReads").innerText = memoryReads;
  document.getElementById("memoryWrites").innerText = memoryWrites;
}

// Render Instruction Table
function renderTable() {
  const tbody = document.querySelector("#instrTable tbody");
  tbody.innerHTML = "";
  memory.forEach((code, index) => {
    const instr = instructionSet[code] ? instructionSet[code].name : "???";
    const cycles = instructionSet[code] ? instructionSet[code].cycles : 0;
    const row = document.createElement("tr");
    row.innerHTML = `<td>${instr}</td><td>${code}</td><td>${cycles}</td>`;
    if (index === PC) row.classList.add("current");
    tbody.appendChild(row);
  });
}

// Execute Next Instruction
function executeInstruction() {
  if (!program.length || PC >= program.length) { running = false; return; }

  IR = memory[PC];
  AR = PC;
  DR = memory[PC];
  const instr = instructionSet[IR];

  if (!instr) { alert(`Unknown instruction at ${PC}: ${IR}`); running = false; return; }

  // Update stats
  totalCycles += instr.cycles;
  totalInstructions++;
  memoryReads += instr.memRead;
  memoryWrites += instr.memWrite;

  // Special HLT instruction
  if (IR === "7001") { running = false; alert("Program Halted!"); }

  PC++;
  updateRegisters();
  updateStats();
  renderTable();
}

// Run Program
let runInterval;
document.getElementById("runProgram").addEventListener("click", () => {
  if (running) return;
  running = true;
  runInterval = setInterval(() => {
    if (!running || PC >= program.length) { clearInterval(runInterval); running=false; return; }
    executeInstruction();
  }, 400);
});

// Next Instruction
document.getElementById("nextInstruction").addEventListener("click", () => {
  executeInstruction();
});

// Reset
document.getElementById("resetProgram").addEventListener("click", () => {
  PC = AC = AR = DR = 0;
  IR = "";
  totalCycles = totalInstructions = memoryReads = memoryWrites = 0;
  running = false;
  updateRegisters();
  updateStats();
  renderTable();
});
