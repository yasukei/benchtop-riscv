// @ts-check
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

const dateCallee =
  ":matches([callee.name=Date], [callee.property.name=Date], " +
  "[callee.computed=true][callee.property.value=Date])";
const timerMessage = "Emulator packages must not use host timers; see ADR 0003 (virtual time).";
const clockMessage = "Emulator packages must not read the host clock; see ADR 0003 (virtual time).";

export default defineConfig(
  {
    ignores: [
      "**/.claude/",
      ".pnpm-store/",
      "**/dist/",
      "**/coverage/",
      "**/node_modules/",
      "**/test-results/",
      "**/playwright-report/",
      "tests/fixtures/",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: {
          // The service discovers tsconfig.json, not this standalone tools config.
          allowDefaultProject: ["packages/web/vite.config.ts"],
          defaultProject: "packages/web/tsconfig.tools.json",
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
  },
  {
    files: ["*.{js,ts}"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["packages/web/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
  },
  {
    // Emulated time is derived from executed instructions only (ADR 0003).
    files: ["packages/{core,elf,riscv,devices,machine}/src/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "setTimeout", message: timerMessage },
        { name: "setInterval", message: timerMessage },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression:matches([object.name=/^(Date|performance)$/], " +
            "[object.property.name=/^(Date|performance)$/], " +
            "[object.computed=true][object.property.value=/^(Date|performance)$/])" +
            ":matches([property.name=now], [computed=true][property.value=now])",
          message: clockMessage,
        },
        {
          selector: `NewExpression${dateCallee}[arguments.length=0]`,
          message: clockMessage,
        },
        {
          // Date called without new reads the host clock even when given arguments.
          selector: `CallExpression${dateCallee}`,
          message: clockMessage,
        },
        {
          selector:
            "MemberExpression[property.name=/^(setTimeout|setInterval)$/], " +
            "MemberExpression[computed=true][property.value=/^(setTimeout|setInterval)$/]",
          message: timerMessage,
        },
      ],
    },
  },
  // Must stay last: turns off rules that conflict with Prettier.
  prettier,
);
