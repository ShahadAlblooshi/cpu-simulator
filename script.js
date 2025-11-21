let memory = {};
let PC = 0, AC = 0, AR = 0, DR = 0, IR = "";
let cycles = 0, executed = 0, memReads = 0, memWrites = 0;

const instrSet = {
  "7800": { name: "CLA", cycles: 1 },
  "7400": { name: "CLE", cycles: 1 },
  "7200": { name: "CMA", cycles: 1 },
  "7100": { name: "CME", cycles: 1 },
  "7080": { name: "CIR", cycles: 1 },
  "7040": { name: "CIL", cycles: 1 },
  "7020": { name: "INC", cycles: 1 },
  "7010": { name: "SPA", cycles: 1 },
  "7008": { name: "SNA", cycles: 1 },
  "7004": { name: "SZA", cycles: 1 },
  "7002": { name: "SZE", cycles: 1 },
  "7001": { name: "HLT", cycles: 1 }
};

function updateUI() {
  document.getElementById("PC").textContent = PC;
  document.getElementById("AC").textContent = AC;
  document.getElementById("AR").textContent = AR;
  document.getElementById("DR").textContent = DR;
  document.getElementById("IR").textContent = IR;

  document.getElementById("totalCycles").textContent = cycles;
  document.getElementById("totalInstructions").textContent = executed;
  document.getElementById("cpi").textContent = (executed ? (cycles / executed).toFixed(2) : 0);
  document.getElementById("memoryReads").textContent = memReads;
  document.getElementById("memoryWrites").textContent = memWrites;
}

document.getElementById("loadProgram").addEventListener("click", () => {
  const file = document.getElementById("programFile").files[0];
  if (!file) {
    alert("Please select a program .txt file first.");
    return;
  }

  const reader = new FileReader();
  reader.onload = function() {
    const lines = reader.result.split("\n");

    memory = {};
    lines.forEach(line => {
      if (line.trim().length === 0) return;

      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        const addr = parseInt(parts[0], 16);
        const value = parts[1].trim();
        memory[addr] = value;
      }
    });

    PC = 0;
    updateUI();
    alert("Program loaded successfully!");
  };

  reader.readAsText(file);
});

document.getElementById("nextInstruction").addEventListener("click", () => {
  const instr = memory[PC];
  if (!instr) {
    IR = "----";
    updateUI();
    return;
  }

  IR = instr;
  executed++;
  cycles += instrSet[instr]?.cycles || 1;

  PC++;
  updateUI();
});

document.getElementById("resetProgram").addEventListener("click", () => {
  PC = AC = AR = DR = 0;
  IR = "----";
  cycles = executed = memReads = memWrites = 0;

  updateUI();
  alert("Simulator reset!");
});
