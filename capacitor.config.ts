import type { CapacitorConfig } from "@capacitor/cli";
import { readFileSync } from "node:fs";

// Capacitor's tools run from the project folder.
const { version } = JSON.parse(readFileSync("package.json", "utf8")) as {
  version: string;
};

// The Android app packages the same built interface as the browser and desktop apps.
const config: CapacitorConfig = {
  appId: "io.github.arthurbrht.pitwall",
  appName: "Pitwall",
  webDir: "dist",
  // The US National Weather Service and OpenStreetMap ask every client to name
  // itself; the desktop app sends the same name.
  appendUserAgent: `Pitwall/${version} (+https://github.com/Arthur-Brht/pitwall)`,
  plugins: {
    // Edge-to-edge insets reach the stylesheet as --safe-area-inset-* variables.
    SystemBars: { insetsHandling: "css" },
  },
};

export default config;
