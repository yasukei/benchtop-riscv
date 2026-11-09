import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    conditions: ["@benchtop-riscv/source", "module", "browser", "development|production"],
  },
  build: { emptyOutDir: false },
});
