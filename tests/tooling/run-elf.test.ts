import { afterEach, describe, expect, it, vi } from "vitest";
import { Hart } from "@benchtop-riscv/riscv";
import { runElf } from "../../scripts/run-elf.js";
import { makeRunnerElf, resultProgram } from "./run-elf.test-support.js";

function invoke(argv: readonly string[], bytes = makeRunnerElf()) {
  let stdout = "";
  let stderr = "";
  const readFile = vi.fn(() => bytes);
  const status = runElf(argv, {
    readFile,
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  });
  return { status, stdout, stderr, readFile };
}

afterEach(() => vi.restoreAllMocks());

describe("ELF CLI runner", () => {
  it.each([0, 3, 255])("returns HTIF status %i and reports the final state", (exitCode) => {
    const result = invoke(
      ["guest.elf"],
      makeRunnerElf({ words: resultProgram((exitCode << 1) | 1) }),
    );
    expect(result.status).toBe(exitCode);
    expect(result.stdout).toBe(
      `Stop reason: halt (exit code ${exitCode})\ninstret: 10000\nPC: 0x8000000c  j\t8000000c\n`,
    );
    expect(result.stderr).toBe("");
    expect(result.readFile).toHaveBeenCalledExactlyOnceWith("guest.elf");
  });

  it("prints a full HTIF code above 255 and returns status 1", () => {
    const result = invoke(["guest.elf"], makeRunnerElf({ words: resultProgram((511 << 1) | 1) }));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Stop reason: halt (exit code 511)\n");
    expect(result.stderr).toBe("HTIF exit code 511 exceeds 255; returning status 1.\n");
  });

  it("limits a nonterminating guest to 1000 instruction attempts", () => {
    const result = invoke(
      ["guest.elf", "--max-instructions", "1000"],
      makeRunnerElf({ words: [0x0000006f] }),
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("Stop reason: budget\ninstret: 1000\nPC: 0x80000000  j\t80000000\n");
    expect(result.stderr).toBe("Instruction limit reached (1000 attempts).\n");
  });

  it("counts trapping attempts and reports an unreadable final PC", () => {
    const result = invoke(
      ["guest.elf", "--max-instructions", "1000"],
      makeRunnerElf({ words: [0xffffffff] }),
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("Stop reason: budget\ninstret: 0\nPC: 0x00000000  <unreadable>\n");
    expect(result.stderr).toBe("Instruction limit reached (1000 attempts).\n");
  });

  it("disassembles current RAM after the guest rewrites an instruction", () => {
    // Store j . over the nop at base + 12, then execute the replacement.
    const bytes = makeRunnerElf({ words: [0x800000b7, 0x06f00113, 0x0020a623, 0x00000013] });
    const result = invoke(["guest.elf", "--max-instructions", "10"], bytes);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("Stop reason: budget\ninstret: 10\nPC: 0x8000000c  j\t8000000c\n");
    expect(result.stderr).toBe("Instruction limit reached (10 attempts).\n");
  });

  it("allows a zero budget without executing any instructions", () => {
    const result = invoke(["--max-instructions", "0", "guest.elf"]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe(
      "Stop reason: budget\ninstret: 0\nPC: 0x80000000  lui\tra,0x80000\n",
    );
    expect(result.stderr).toBe("Instruction limit reached (0 attempts).\n");
  });

  it("rejects a non-ELF file", () => {
    const result = invoke(["guest.elf"], new Uint8Array(52));
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("Error: Missing ELF magic\n");
  });

  it("reports a board load error", () => {
    const result = invoke(["guest.elf"], makeRunnerElf({ entry: 0x1000 }));
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("Error: Entry point is outside every loadable segment\n");
  });

  it("reports a file read error", () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    expect(
      runElf(["missing.elf"], {
        readFile: () => {
          throw new Error("File not found");
        },
        stdout,
        stderr,
      }),
    ).toBe(1);
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledExactlyOnceWith("Error: File not found\n");
  });

  it("reports a fatal stop and its message", () => {
    vi.spyOn(Hart.prototype, "run").mockReturnValue({ kind: "fatal", message: "Internal failure" });
    const result = invoke(["guest.elf"]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Stop reason: fatal\ninstret: 0\nPC: 0x80000000");
    expect(result.stderr).toBe("Fatal error: Internal failure\n");
  });

  it("handles an unexpected breakpoint stop", () => {
    vi.spyOn(Hart.prototype, "run").mockReturnValue({ kind: "breakpoint", pc: 0x80000000 });
    const result = invoke(["guest.elf"]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Stop reason: breakpoint\n");
    expect(result.stderr).toBe("Stopped at a breakpoint before the guest halted.\n");
  });

  it("reports thrown execution errors", () => {
    vi.spyOn(Hart.prototype, "run").mockImplementation(() => {
      throw new Error("Execution failed");
    });
    const result = invoke(["guest.elf"]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("Error: Execution failed\n");
  });

  it("prints usage when no file is provided", () => {
    const result = invoke([]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("Usage: pnpm run:elf <file> [--max-instructions <n>]\n");
    expect(result.readFile).not.toHaveBeenCalled();
  });

  it.each(["-1", "1.5", "NaN", "Infinity", "9007199254740992", "1e3", ""])(
    "rejects an invalid instruction limit: %s",
    (value) => {
      const result = invoke(["guest.elf", "--max-instructions", value]);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(
        "--max-instructions must be a nonnegative safe integer.\nUsage:",
      );
      expect(result.readFile).not.toHaveBeenCalled();
    },
  );

  it.each([["guest.elf", "--max-instructions"], ["--unknown"], ["one.elf", "two.elf"]])(
    "rejects malformed arguments: %j",
    (...argv) => {
      const result = invoke(argv);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("Usage:");
      expect(result.readFile).not.toHaveBeenCalled();
    },
  );

  it("accepts a filename beginning with a dash after --", () => {
    const result = invoke(["--", "-guest.elf"]);
    expect(result.status).toBe(0);
    expect(result.readFile).toHaveBeenCalledExactlyOnceWith("-guest.elf");
    expect(result.stderr).toBe("");
  });
});
