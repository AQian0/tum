import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const configDir = dirname(fileURLToPath(import.meta.url));
const packagesDir = resolve(configDir, "..");

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      "@tum/core": resolve(packagesDir, "core/src/index.ts"),
      "@tum/terminal": resolve(packagesDir, "terminal/src/index.ts"),
      "@tum/session": resolve(packagesDir, "session/src/index.ts"),
    },
  },
});
