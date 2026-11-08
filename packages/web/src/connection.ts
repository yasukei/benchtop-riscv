import type { ClientEvent } from "./machine-client.js";

export type Connection =
  { state: "connecting" } | { state: "ready"; isa: string } | { state: "error" };

/** Folds client events into the connection state shown by the UI. */
export function nextConnection(current: Connection, event: ClientEvent): Connection {
  switch (event.type) {
    case "ready":
      return { state: "ready", isa: event.isa };
    case "connectionError":
      return { state: "error" };
    default:
      return current;
  }
}
