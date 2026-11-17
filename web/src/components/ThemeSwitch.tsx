import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { readText, THEME_KEY, writeText } from "../lib/storage.ts";
import { Segmented } from "./ui.tsx";

type Choice = "system" | "light" | "dark";

const OPTIONS = [
  { value: "system", label: "System", icon: <Monitor size={14} aria-hidden /> },
  { value: "light", label: "Light", icon: <Sun size={14} aria-hidden /> },
  { value: "dark", label: "Dark", icon: <Moon size={14} aria-hidden /> },
] as const;

function apply(choice: Choice) {
  const dark =
    choice === "dark" ||
    (choice === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#111111" : "#f7f7f5");
}

export function ThemeSwitch() {
  const [choice, setChoice] = useState<Choice>(() => {
    const saved = readText(THEME_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  });

  useEffect(() => {
    apply(choice);
    if (choice !== "system") return;
    const query = matchMedia("(prefers-color-scheme: dark)");
    const follow = () => apply("system");
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, [choice]);

  return (
    <Segmented<Choice>
      label="Appearance"
      value={choice}
      options={OPTIONS}
      onChange={(value) => {
        setChoice(value);
        writeText(THEME_KEY, value);
      }}
    />
  );
}
