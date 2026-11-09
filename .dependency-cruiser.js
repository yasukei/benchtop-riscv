// @ts-check
// Enforces the package dependency direction (docs: AGENTS.md, ADR 0001):
//   web → machine → riscv | devices | elf → core.

/** Workspace packages each package may import, besides itself. */
const allowedDependencies = {
  core: [],
  elf: ["core"],
  riscv: ["core"],
  devices: ["core"],
  machine: ["core", "elf", "riscv", "devices"],
  web: ["core", "elf", "riscv", "devices", "machine"],
};

const packages = Object.keys(allowedDependencies);

/** @type {import("dependency-cruiser").IForbiddenRuleType[]} */
const directionRules = Object.entries(allowedDependencies).flatMap(([name, allowed]) => {
  const forbidden = packages.filter((other) => other !== name && !allowed.includes(other));
  if (forbidden.length === 0) return [];
  return [
    {
      name: `${name}-dependency-direction`,
      severity: "error",
      comment: `packages/${name} may only depend on: ${allowed.join(", ") || "nothing"}.`,
      from: { path: `^packages/${name}/` },
      to: { path: `^packages/(${forbidden.join("|")})/` },
    },
  ];
});

/** @type {import("dependency-cruiser").IConfiguration} */
export default {
  forbidden: [
    ...directionRules,
    {
      name: "not-to-unresolvable",
      severity: "error",
      // Undeclared workspace imports still resolve through the root node_modules; that every
      // package declares what it imports is checked by tests/tooling/workspace-dependencies.test.ts.
      comment: "Imports must resolve.",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^|/)(dist|coverage)/" },
    // Count type-only imports too: they couple packages just as much.
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      conditionNames: ["@benchtop-riscv/source", "import", "default"],
      exportsFields: ["exports"],
      extensions: [".ts", ".tsx", ".js", ".json"],
    },
  },
};
