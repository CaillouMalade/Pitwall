import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { followTheme, markNativePlatform } from "./lib/native.ts";
import { SettingsProvider } from "./lib/settings.tsx";
import "./styles.css";

markNativePlatform();
followTheme();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </StrictMode>,
);
