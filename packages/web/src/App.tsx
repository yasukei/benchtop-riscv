import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { MachineClient } from "./machine-client.js";
import { Workbench } from "./workbench.js";

export function App({ client }: { client: MachineClient }) {
  const workbench = useMemo(() => new Workbench(client), [client]);
  const view = useSyncExternalStore(workbench.subscribe, workbench.getSnapshot);
  useEffect(() => workbench.connect(), [workbench]);

  return (
    <main className="workbench">
      <header>
        <h1>benchtop-riscv</h1>
        <p>
          Machine: <output aria-label="Machine status">{view.connection}</output>
        </p>
      </header>
      <section aria-label="Program controls" className="panel">
        <label htmlFor="elf-file">ELF file</label>
        <input
          id="elf-file"
          type="file"
          disabled={!view.controls.load}
          onChange={(event) => {
            void workbench.loadFile(event.currentTarget.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
        <p>
          Loaded file: <output aria-label="Loaded file">{view.fileName}</output>
        </p>
        {view.loading && <p role="status">Loading ELF…</p>}
        <div className="controls">
          <button disabled={!view.controls.run} onClick={() => workbench.command("run")}>
            Run
          </button>
          <button disabled={!view.controls.pause} onClick={() => workbench.command("pause")}>
            Pause
          </button>
          <button disabled={!view.controls.step} onClick={() => workbench.command("step")}>
            Step
          </button>
          <button disabled={!view.controls.reset} onClick={() => workbench.command("reset")}>
            Reset
          </button>
        </div>
        <p className="execution-status">
          Status: <output aria-label="Execution status">{view.status}</output>
          {" · "}instret: <output aria-label="instret">{view.instret}</output>
        </p>
        {view.loadError && <p role="alert">loadError · {view.loadError}</p>}
      </section>
      <section aria-labelledby="instruction-heading" className="panel">
        <h2 id="instruction-heading">Current instruction</h2>
        <code aria-label="Current instruction">{view.instruction}</code>
      </section>
      <section aria-labelledby="register-heading" className="panel">
        <h2 id="register-heading">Registers</h2>
        <p>Highlighted values changed since the previous state.</p>
        <table>
          <thead>
            <tr>
              <th scope="col">Register</th>
              <th scope="col">ABI name</th>
              <th scope="col">Hex value</th>
            </tr>
          </thead>
          <tbody>
            {view.registers.map((row) => (
              <tr key={row.name} className={row.changed ? "changed" : undefined}>
                <th scope="row">{row.name}</th>
                <td>{row.abi}</td>
                <td>
                  <output aria-label={row.name}>{row.value}</output>
                  {row.changed && (
                    <span className="change-marker" aria-label="Changed">
                      {" "}
                      ●
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
