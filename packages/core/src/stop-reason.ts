/** Why `run(budget)` returned control to its caller. */
export type StopReason =
  /** The instruction budget was used up; call `run` again to continue. */
  | { kind: "budget" }
  /** The next instruction to execute is at a breakpoint. */
  | { kind: "breakpoint"; pc: number }
  /** The guest asked to stop, e.g. through HTIF `tohost`. */
  | { kind: "halt"; exitCode: number }
  /** The emulator cannot continue, e.g. on an internal error. */
  | { kind: "fatal"; message: string };
