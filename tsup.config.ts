import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  // Disables the `0 && (module.exports = {...})` annotation that tsup injects
  // into CJS output to help bundlers tree-shake ESM. Socket.dev flags this
  // dead-code pattern as "Obfuscated code" (supply chain risk), so we opt out.
  cjsInterop: false,
});
