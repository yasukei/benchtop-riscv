# ISA support

The hart currently executes RV32I and `fence.i` (Zifencei). It has no privilege modes,
CSR state or trap handler yet. The decoder and disassembler also recognize Zicsr,
`mret` and `wfi`; executing these currently stops with a fatal error.

| Group            | Implemented instructions                                               | Notes                                                                                                   |
| ---------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Upper immediates | `lui`, `auipc`                                                         | Results wrap to 32 bits.                                                                                |
| Register ALU     | `add`, `sub`, `sll`, `slt`, `sltu`, `xor`, `srl`, `sra`, `or`, `and`   | Register shift counts use the low five bits.                                                            |
| Immediate ALU    | `addi`, `slti`, `sltiu`, `xori`, `ori`, `andi`, `slli`, `srli`, `srai` | Immediates are sign-extended; shifts use five-bit counts.                                               |
| Jumps            | `jal`, `jalr`                                                          | Link is PC + 4; `jalr` clears target bit 0.                                                             |
| Branches         | `beq`, `bne`, `blt`, `bge`, `bltu`, `bgeu`                             | Only taken targets must be four-byte aligned.                                                           |
| Loads            | `lb`, `lh`, `lw`, `lbu`, `lhu`                                         | Little-endian, with sign or zero extension. Misaligned accesses are performed.                          |
| Stores           | `sb`, `sh`, `sw`                                                       | Little-endian. Misaligned accesses are performed.                                                       |
| Ordering         | `fence`, `fence.i`                                                     | No-ops: execution is sequential and there is no instruction cache. Self-modifying code is fetched anew. |
| Environment      | `ecall`, `ebreak`                                                      | Recognized, but stop execution with a fatal error until trap handling is implemented.                   |

`Hart` accepts a bus and an optional direct RAM window. An access uses the byte array
only if **all** its bytes are inside the window. Other accesses, including accesses
that straddle the window boundary, go through the bus as a single access; an unmapped
or partially mapped access raises a bus fault. Loads to `x0` still perform the access
and can fault. Instruction fetches must be four-byte aligned.

Illegal or unsupported instructions, environment calls, breakpoints, misaligned
instruction targets and bus faults return a `fatal` stop reason with the faulting PC.
The PC stays at that instruction, and the instruction does not retire. A misaligned
jump does not write its link register. There is no architectural trap delivery yet.

`reset(pc)` clears the integer registers and retired-instruction counter and normalizes
the PC to an unsigned 32-bit value. `run(budget)` accepts a nonnegative safe integer and
counts instruction **attempts**, including a failing attempt, rather than retirements.
It returns `budget` after exactly that many attempts, or `fatal` at the first failure.
A zero budget does nothing. `step()` attempts one instruction and returns `budget` on
success. `instret` counts only successfully retired instructions; `ecall` and `ebreak`
do not increment it. Writes by guest instructions to `x0` are discarded.
