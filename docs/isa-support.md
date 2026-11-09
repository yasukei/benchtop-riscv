# ISA support

The hart executes RV32I, Zicsr and `fence.i` (Zifencei), with minimal M-mode
and U-mode privilege support. Reset starts in M-mode. S-mode, interrupts, PMP,
address translation and counter CSRs are not implemented yet.

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
| Environment      | `ecall`, `ebreak`                                                      | Deliver synchronous traps to M-mode.                                                                    |

| System    | Implemented instructions                                | Notes                                                                                                                                                  |
| --------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CSR       | `csrrw`, `csrrs`, `csrrc`, `csrrwi`, `csrrsi`, `csrrci` | Swap returns the old value; set/clear suppress writes for encoded `rs1=x0` or `uimm=0`. A nonzero source register holding zero still requests a write. |
| Privilege | `mret`, `wfi`                                           | M-mode only. `wfi` is a no-op; `mret` restores mode from MPP and PC from `mepc`.                                                                       |

## Machine CSRs

| CSR                                         | Address         | Behavior                                                                                                                                                                                   |
| ------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mstatus`                                   | `0x300`         | Only MIE (bit 3), MPIE (bit 7) and MPP (bits 12:11) exist; other fields read zero. MPP is WARL: U (`00`) and M (`11`) are retained; S (`01`) and reserved (`10`) become U, matching Spike. |
| `misa`                                      | `0x301`         | Reads `0x40000100` (RV32I). It is MRW: writes are legal and ignored (WARL), so probing extension support does not trap.                                                                    |
| `mie`                                       | `0x304`         | Minimal WARL register: reads zero and ignores writes until interrupts are added in M2. Required by the unprotected `csrwi mie, 0` in env/p startup.                                        |
| `mtvec`                                     | `0x305`         | Direct mode only: low two mode bits are WARL and always read zero.                                                                                                                         |
| `mscratch`                                  | `0x340`         | Read/write 32-bit scratch register.                                                                                                                                                        |
| `mepc`                                      | `0x341`         | Read/write exception PC; bits 1:0 always read zero (IALIGN=32).                                                                                                                            |
| `mcause`                                    | `0x342`         | Read/write 32-bit trap cause.                                                                                                                                                              |
| `mtval`                                     | `0x343`         | Read/write 32-bit trap value.                                                                                                                                                              |
| `mvendorid`, `marchid`, `mimpid`, `mhartid` | `0xf11`–`0xf14` | Read-only; read zero.                                                                                                                                                                      |

All mutable CSR state resets to zero. Address bits 11:10 determine read-only
access; any requested write to a read-only CSR traps, even with a zero value.
All listed CSRs require M-mode. U-mode access and any unknown CSR access raise
illegal-instruction exceptions, including when CSRRW suppresses its read with
`rd=x0`. CSRRW/CSRRWI with `rd=x0` suppress architectural read side effects;
the implemented CSRs have no read side effects. Unsupported probes such as
`mnstatus`, `satp`, PMP, `medeleg` and `mideleg` always trap.

## Memory access

`Hart` accepts a bus and an optional direct RAM window. An access uses the byte array
only if **all** its bytes are inside the window. Other accesses, including accesses
that straddle the window boundary, go through the bus as a single access; an unmapped
or partially mapped access raises a bus fault. Loads to `x0` still perform the access
and can fault. Instruction fetches must be four-byte aligned.

## Synchronous traps

| Cause | Exception                      | `mtval`                                                                                    |
| ----- | ------------------------------ | ------------------------------------------------------------------------------------------ |
| 0     | Instruction address misaligned | Target address; a jump or taken branch traps at its own PC before writing a link register. |
| 1     | Instruction access fault       | Fetch address, including an aligned unmapped PC.                                           |
| 2     | Illegal instruction            | Instruction word, including illegal CSR and privilege accesses.                            |
| 3     | Breakpoint (`ebreak`)          | Instruction PC, matching Spike.                                                            |
| 5     | Load access fault              | Faulting data address.                                                                     |
| 7     | Store access fault             | Faulting data address.                                                                     |
| 8     | Environment call from U-mode   | Zero.                                                                                      |
| 11    | Environment call from M-mode   | Zero.                                                                                      |

Trap entry saves the trapping PC in `mepc` (aligned to IALIGN=32), records
`mcause` and `mtval`, copies MIE to MPIE, clears MIE, saves the current privilege
in MPP, and enters M-mode at `mtvec`. A fetch bus fault retains its fetch context
and therefore cannot become a load access fault. Integer destination registers
are unchanged by trapping instructions.

`mret` restores privilege from MPP, copies MPIE to MIE, sets MPIE to one, clears
MPP to U, and resumes at `mepc`. In U-mode, `mret` and `wfi` are illegal.

## Execution budget

`reset(pc)` clears the integer registers, mutable CSRs and retired-instruction
counter, sets M-mode, and normalizes the PC to an unsigned 32-bit value.
`run(budget)` accepts a nonnegative safe integer and counts instruction
**attempts**, including trapping attempts, rather than retirements. It returns
`budget` after exactly that many attempts, even when a trap handler repeatedly
traps. A zero budget does nothing. `step()` attempts one instruction and returns
`budget`, after trap entry if that instruction traps. `instret` counts only
successfully retired instructions; `ecall` and `ebreak` do not increment it.
Writes by guest instructions to `x0` are discarded. Unexpected host errors still
propagate to the caller.
