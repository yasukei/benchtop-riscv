import { useEffect, useState } from "react";
import { nextConnection, type Connection } from "./connection.js";
import type { MachineClient } from "./machine-client.js";

function describe(connection: Connection): string {
  switch (connection.state) {
    case "connecting":
      return "Connecting";
    case "ready":
      return `Ready (${connection.isa})`;
    case "error":
      return "Worker error";
  }
}

export function App({ client }: { client: MachineClient }) {
  const [connection, setConnection] = useState<Connection>({ state: "connecting" });

  useEffect(() => {
    const unsubscribe = client.subscribe((event) =>
      setConnection((current) => nextConnection(current, event)),
    );
    client.send({ type: "hello" });
    return unsubscribe;
  }, [client]);

  return (
    <main className="workbench">
      <h1>benchtop-riscv</h1>
      <p>
        Machine: <output aria-label="Machine status">{describe(connection)}</output>
      </p>
    </main>
  );
}
