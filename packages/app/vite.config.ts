import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packagesDir = resolve(__dirname, "..");

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@tum/core": resolve(packagesDir, "core/src/index.ts"),
      "@tum/terminal": resolve(packagesDir, "terminal/src/index.ts"),
      "@tum/session": resolve(packagesDir, "session/src/index.ts"),
    },
  },
});
