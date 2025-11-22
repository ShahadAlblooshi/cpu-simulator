// ====================== CPU STATE ============================
let memory = new Array(4096).fill(0);

let PC = 0;
let AC = 0;
let AR = 0;
let DR = 0;
let IR = "";

let totalCycles = 0;
let totalInstructions = 0;
let memoryReads = 0;
let memoryWrites = 0;

let programLoaded = false;

// ====================== UPDATE UI ============================
function updateRegisters() {
    document.getElementById("PC").innerText = PC;
    document.getElementById("AC").innerText = AC;
    document.getElementById("AR").innerText = AR;
    document.getElementById("DR").innerText = DR;
    document.getElementById("IR").innerText = IR;
}

function updateStats() {
    document.getElementById("totalCycles").innerText = totalCycles;
    document.getElementById("totalInstructions").innerText = totalInstructions;
    document.getElementById("cpi").innerText =
        totalInstructions === 0 ? 0 : (totalCycles / totalInstructions).toFixed(2);
    document.getElementById("memoryReads").innerText = memoryReads;
    document.getElementById("memoryWrites").innerText = memoryWrites;
}

// ====================== LOAD PROGRAM =========================
document.getElementById("loadProgram").addEventListener("click", () => {
    const file = document.getElementById("programFile").files[0];
    if (!file) return alert("Choose a program.txt file!");

    const reader = new FileReader();

    reader.onload = function (e) {
        const lines = e.target.result.split("\n");

        lines.forEach(line => {
            line = line.trim();
            if (line === "") return;

            let [addr, value] = line.split(" ");

            addr = parseInt(addr);           // decimal address
            value = parseInt(value, 16);      // <-- HEX conversion FIXED

            memory[addr] = value;
        });

        programLoaded = true;
        alert("Program loaded successfully!");

        PC = 0;
        updateRegisters();
        updateStats();
    };

    reader.readAsText(file);
});

// ====================== FETCH / DECODE / EXECUTE ================
function step() {
    if (!programLoaded) {
        alert("Load a program first!");
        return;
    }

    // FETCH
    AR = PC;
    IR = memory[PC] || 0;
    DR = IR; // DR always receives the instruction
    memoryReads++;

    // DECODE OPCODE
    const opcode = (IR & 0xF000) >> 12;   // top 4 bits
    const operand = IR & 0x0FFF;         // lower 12 bits

    // EXECUTE
    switch (opcode) {
        case 0x7: // Opcode 7xxx = LOAD AC from memory[operand]
            AR = operand;
            DR = memory[AR];
            AC = DR;
            memoryReads++;
            totalCycles += 2;
            break;

        case 0x8: // example: ADD immediate (8xxx)
            AC = AC + operand;
            totalCycles += 1;
            break;

        default:
            console.log("Unknown instruction:", IR.toString(16));
            totalCycles += 1;
            break;
    }

    PC++;
    totalInstructions++;

    updateRegisters();
    updateStats();
}

// ====================== BUTTONS ============================
document.getElementById("nextInstruction").addEventListener("click", step);

document.getElementById("runProgram").addEventListener("click", () => {
    let timer = setInterval(() => {
        step();
        if (PC >= memory.length) clearInterval(timer);
    }, 400);
});

document.getElementById("resetProgram").addEventListener("click", () => {
    PC = AC = AR = DR = 0;
    IR = "";
    totalCycles = totalInstructions = memoryReads = memoryWrites = 0;
    updateRegisters();
    updateStats();
});
