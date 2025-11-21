// Simulator State
let totalCycles = 0;
let totalInstructions = 0;
let memoryReads = 0;
let memoryWrites = 0;

let PC = 0;  // Program Counter
let AC = 0;  // Accumulator
let IR = ""; // Instruction Register
let AR = 0;  // Address Register
let DR = 0;  // Data Register

let memory = [];
let program = [];

const instructions = [
  { name: "LOAD", cycles: 2, memRead: 1, memWrite: 0, IR: "0001" },
  { name: "STORE", cycles: 3, memRead: 0, memWrite: 1, IR: "0010" },
  { name: "ADD", cycles: 1, memRead: 0, memWrite: 0, IR: "0011" },
  { name: "SUB", cycles: 1, memRead: 0, memWrite: 0, IR: "0100" }
];

let currentInstructionIndex = 0;

// Render Instructions Table
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

// Update stats and registers
function updateStats() {
  document.getElementById("totalCycles").innerText = totalCycles;
  document.getElementById("totalInstructions").innerText = totalInstructions;
  document.getElementById("cpi").innerText = totalInstructions === 0 ? 0 : (totalCycles / totalInstructions).toFixed(2);
  document.getElementById("memoryReads").innerText = memoryReads;
  document.getElementById("memoryWrites").innerText = memoryWrites;

  document.getElementById("PC").innerText = PC;
  document.getElementById("AC").innerText = AC;
  document.getElementById("IR").innerText = IR || "----";
  document.getElementById("AR").innerText = AR;
  document.getElementById("DR").innerText = DR;

  renderMemory();
}

// Render Memory Table
function renderMemory() {
  const tbody = document.querySelector("#memoryTable tbody");
  tbody.innerHTML = "";
  memory.forEach((value, address) => {
    if (value !== undefined) {
      const row = document.createElement("tr");
      row.innerHTML = `<td>${address}</td><td>${value}</td>`;
      tbody.appendChild(row);
    }
  });
}

// Execute Instruction
function executeInstruction() {
  if (currentInstructionIndex >= program.length) return;

  const line = program[currentInstructionIndex];
  const parts = line.split(" ");
  const opcode = parts[0].toUpperCase();
  let instr = instructions.find(i => i.name === opcode);
  if (!instr) return;

  IR = instr.IR;
  totalCycles += instr.cycles;
  totalInstructions += 1;
  memoryReads += instr.memRead;
  memoryWrites += instr.memWrite;

  AR = parseInt(parts[1]) || 0;

  switch(opcode) {
    case "LOAD":
      DR = memory[AR] || 0;
      AC = DR;
      break;
    case "STORE":
      DR = AC;
      memory[AR] = DR;
      break;
    case "ADD":
      AC += parseInt(parts[1]) || 0;
      break;
    case "SUB":
      AC -= parseInt(parts[1]) || 0;
      break;
  }

  PC++;
  currentInstructionIndex++;
  renderTable();
  updateStats();
}

// Load program from file
document.getElementById("loadProgram").addEventListener("click", () => {
  const fileInput = document.getElementById("programFile");
  const file = fileInput.files[0];
  if (!file) return alert("Select a program file!");
  const reader = new FileReader();
  reader.onload = e => {
    program = e.target.result.split("\n").map(l => l.trim()).filter(l => l);
    currentInstructionIndex = 0;
    PC = 0;
    updateStats();
    alert("Program loaded!");
  };
  reader.readAsText(file);
});

// Next instruction button
document.getElementById("nextInstruction").addEventListener("click", executeInstruction);

// Run program
document.getElementById("run").addEventListener("click", () => {
  const interval = setInterval(() => {
    if (currentInstructionIndex >= program.length) clearInterval(interval);
    else executeInstruction();
  }, 300);
});

// Initial render
renderTable();
updateStats();
