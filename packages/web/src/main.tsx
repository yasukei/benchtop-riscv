import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { MachineClient } from "./machine-client.js";
import "./style.css";

const client = new MachineClient(
  new Worker(new URL("./machine.worker.ts", import.meta.url), { type: "module" }),
);
const element = document.getElementById("root");
if (!element) throw new Error("Missing app root");
createRoot(element).render(<App client={client} />);
