import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { parseElf } from "@benchtop-riscv/elf";
import { createTestBoard } from "@benchtop-riscv/machine";
import { disassemble } from "@benchtop-riscv/riscv";

const usage = "Usage: pnpm run:elf <file> [--max-instructions <n>]\n";

/** Run a bare-metal ELF; argv contains only the arguments after the script name. */
export function runElf(
  argv: readonly string[],
  io: {
    readFile(path: string): Uint8Array;
    stdout(text: string): void;
    stderr(text: string): void;
  },
): number {
  let file: string | undefined;
  let maxInstructions = 100_000_000;
  let positionalOnly = false;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!;
    if (!positionalOnly && argument === "--") {
      positionalOnly = true;
    } else if (!positionalOnly && argument === "--max-instructions") {
      const value = argv[++index];
      if (value === undefined || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
        io.stderr(`--max-instructions must be a nonnegative safe integer.\n${usage}`);
        return 1;
      }
      maxInstructions = Number(value);
    } else if ((!positionalOnly && argument.startsWith("-")) || file !== undefined) {
      io.stderr(`Unexpected argument: ${argument}\n${usage}`);
      return 1;
    } else {
      file = argument;
    }
  }
  if (!file) {
    io.stderr(usage);
    return 1;
  }

  try {
    const elf = parseElf(io.readFile(file));
    const board = createTestBoard();
    board.load(elf);
    const stop = board.run(maxInstructions);
    const { pc, instret } = board.hart;
    const word = board.readWord(pc);
    const assembly = word === undefined ? "<unreadable>" : disassemble(word, pc);
    const detail = stop.kind === "halt" ? ` (exit code ${stop.exitCode})` : "";
    io.stdout(
      `Stop reason: ${stop.kind}${detail}\ninstret: ${instret}\nPC: 0x${pc.toString(16).padStart(8, "0")}  ${assembly}\n`,
    );
    switch (stop.kind) {
      case "halt":
        if (stop.exitCode > 255) {
          io.stderr(`HTIF exit code ${stop.exitCode} exceeds 255; returning status 1.\n`);
          return 1;
        }
        return stop.exitCode;
      case "budget":
        io.stderr(`Instruction limit reached (${maxInstructions} attempts).\n`);
        return 1;
      case "fatal":
        io.stderr(`Fatal error: ${stop.message}\n`);
        return 1;
      case "breakpoint":
        io.stderr("Stopped at a breakpoint before the guest halted.\n");
        return 1;
    }
  } catch (error) {
    io.stderr(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = runElf(process.argv.slice(2), {
    readFile: (path) => readFileSync(resolve(process.env.INIT_CWD ?? process.cwd(), path)),
    stdout: (text) => {
      process.stdout.write(text);
    },
    stderr: (text) => {
      process.stderr.write(text);
    },
  });
}
