// Simulator state
let PC = 0, AC = 0, AR = 0, DR = 0, IR = "";
let totalCycles = 0, totalInstructions = 0, memoryReads = 0, memoryWrites = 0;
let currentInstructionIndex = 0;
let memory = [];
let program = [];

// Instruction definitions
const instructions = [
  { name: "LOAD", cycles: 2, memRead: 1, memWrite: 0, IR: "0001" },
  { name: "STORE", cycles: 3, memRead: 0, memWrite: 1, IR: "0010" },
  { name: "ADD", cycles: 1, memRead: 0, memWrite: 0, IR: "0011" },
  { name: "SUB", cycles: 1, memRead: 0, memWrite: 0, IR: "0100" }
];

// Render instruction table
function renderTable() {
  const tbody = document.querySelector("#instrTable tbody");
  tbody.innerHTML = "";
  instructions.forEach((instr, i) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${instr.name}</td><td>${instr.cycles}</td><td>${instr.memRead}</td><td>${instr.memWrite}</td>`;
    if (i === currentInstructionIndex) row.classList.add("current");
    tbody.appendChild(row);
  });
}
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
    memory = [];   // Clear memory
    program = [];  // Clear program

    // Parse your memory file
    const lines = text.split("\n").map(line => line.trim()).filter(line => line !== "");
    lines.forEach(line => {
      const parts = line.split(" ");
      const addr = parseInt(parts[0], 16);  // first column = memory address (hex)
      const value = parseInt(parts[1], 16); // second column = value (hex)
      memory[addr] = value;
    });

    // Optional demo program (for executing instructions)
    program = [
      "LOAD 0",
      "ADD 1",
      "ADD 2",
      "STORE 10"
    ];

    alert("Memory loaded! Demo program ready.");
    PC = 0;
    AC = 0;
    IR = "";
    AR = 0;
    DR = 0;
    totalCycles = 0;
    totalInstructions = 0;
    memoryReads = 0;
    memoryWrites = 0;
    renderTable();
    updateStats();
  };
  reader.readAsText(file);
}

// Update registers & stats
function updateStats() {
  document.getElementById("PC").innerText = PC;
  document.getElementById("AC").innerText = AC;
  document.getElementById("AR").innerText = AR;
  document.getElementById("DR").innerText = DR;
  document.getElementById("IR").innerText = IR;
  document.getElementById("totalCycles").innerText = totalCycles;
  document.getElementById("totalInstructions").innerText = totalInstructions;
  document.getElementById("memoryReads").innerText = memoryReads;
  document.getElementById("memoryWrites").innerText = memoryWrites;
  document.getElementById("cpi").innerText = totalInstructions === 0 ? 0 : (totalCycles / totalInstructions).toFixed(2);
}

// Execute one instruction
function executeInstruction() {
  if (currentInstructionIndex >= program.length) {
    alert("Program finished!");
    return;
  }

  const line = program[currentInstructionIndex].trim();
  if (!line) { currentInstructionIndex++; return; }

  const parts = line.split(" ");
  const opcode = parts[0].toUpperCase();
  const operand = parseInt(parts[1]) || 0;

  const instr = instructions.find(i => i.name === opcode);
  if (!instr) { alert("Unknown instruction: " + opcode); currentInstructionIndex++; return; }

  IR = instr.IR;
  totalCycles += instr.cycles;
  totalInstructions++;
  memoryReads += instr.memRead;
  memoryWrites += instr.memWrite;
  AR = operand;

  switch(opcode) {
    case "LOAD": DR = memory[AR] || 0; AC = DR; break;
    case "STORE": DR = AC; memory[AR] = DR; break;
    case "ADD": AC += operand; break;
    case "SUB": AC -= operand; break;
  }

  PC++;
  currentInstructionIndex++;
  renderTable();
  updateStats();
}

// Event listeners
document.getElementById("nextInstruction").addEventListener("click", executeInstruction);

document.getElementById("runProgram").addEventListener("click", () => {
  const interval = setInterval(() => {
    executeInstruction();
    if (currentInstructionIndex >= program.length) clearInterval(interval);
  }, 300);
});

document.getElementById("resetProgram").addEventListener("click", () => {
  PC = AC = AR = DR = 0; IR = "";
  totalCycles = totalInstructions = memoryReads = memoryWrites = 0;
  currentInstructionIndex = 0;
  memory = [];
  renderTable();
  updateStats();
});

document.getElementById("loadProgram").addEventListener("click", () => {
  const fileInput = document.getElementById("programFile");
  const file = fileInput.files[0];
  if (!file) { alert("Select a program file first!"); return; }

  const reader = new FileReader();
  reader.onload = e => {
    program = e.target.result.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
    PC = AC = AR = DR = 0; IR = "";
    totalCycles = totalInstructions = memoryReads = memoryWrites = 0;
    currentInstructionIndex = 0;
    memory = [];
    renderTable();
    updateStats();
    alert("Program loaded! Ready to run.");
    console.log("Program:", program);
  };
  reader.readAsText(file);
});

// Initial render
renderTable();
updateStats();
