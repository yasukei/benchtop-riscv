// Messages between the UI thread and the machine Worker (ADR 0004). Every message is plain,
// structured-cloneable data. The protocol grows with the milestones; it starts with a
// handshake only.

/** Sent by the UI to the machine Worker. */
export type UiToMachineMessage = { type: "hello" };

/** Sent by the machine Worker to the UI. */
export type MachineToUiMessage = { type: "ready"; isa: string };
