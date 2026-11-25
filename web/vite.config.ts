import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const { version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: {
    // The bundled observation log is one lazily loaded chunk of about 110 kB gzipped,
    // fetched only when the weather archive cannot be reached.
    chunkSizeWarningLimit: 700,
    outDir: "../dist",
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react",
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 30,
            },
            {
              name: "leaflet",
              test: /[\\/]node_modules[\\/]leaflet[\\/]/,
              priority: 30,
            },
            // Android-only plugins are left out so they load on demand, never at start-up.
            {
              name: "charts",
              test: /[\\/]node_modules[\\/](?!@capacitor[\\/])/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
});
