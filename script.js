// Simulator state
let totalCycles = 0;
let totalInstructions = 0;
let memoryReads = 0;
let memoryWrites = 0;

// Define instructions
const instructions = [
  { name: "LOAD", cycles: 2, memRead: 1, memWrite: 0 },
  { name: "STORE", cycles: 3, memRead: 0, memWrite: 1 },
  { name: "ADD", cycles: 1, memRead: 0, memWrite: 0 },
  { name: "SUB", cycles: 1, memRead: 0, memWrite: 0 }
];

let currentInstructionIndex = 0;

// Populate table initially
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

// Update dashboard stats
function updateStats() {
  document.getElementById("totalCycles").innerText = totalCycles;
  document.getElementById("totalInstructions").innerText = totalInstructions;
  document.getElementById("cpi").innerText = totalInstructions === 0 ? 0 : (totalCycles / totalInstructions).toFixed(2);
  document.getElementById("memoryReads").innerText = memoryReads;
  document.getElementById("memoryWrites").innerText = memoryWrites;
}

// Execute a single instruction
function executeInstruction() {
  const instr = instructions[currentInstructionIndex];
  totalCycles += instr.cycles;
  totalInstructions += 1;
  memoryReads += instr.memRead;
  memoryWrites += instr.memWrite;

  currentInstructionIndex = (currentInstructionIndex + 1) % instructions.length;
  renderTable();
  updateStats();
}

// Event listeners
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
    if (totalInstructions >= 50) clearInterval(interval);
  }, 200);
});

let program = [];

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
    // Assuming each line is one instruction
    program = text.split("\n").map(line => line.trim()).filter(line => line !== "");
    console.log("Program loaded:", program);
    alert("Program loaded successfully!");
  };
  
  reader.readAsText(file);
}

// Initial render
renderTable();
updateStats();
