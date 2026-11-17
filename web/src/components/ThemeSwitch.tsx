import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { readText, THEME_KEY, writeText } from "../lib/storage.ts";

type Choice = "system" | "light" | "dark";

const OPTIONS = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
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

  const choose = (value: Choice) => {
    setChoice(value);
    writeText(THEME_KEY, value);
  };

  return (
    <div className="segmented" role="radiogroup" aria-label="Appearance">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={choice === value}
          aria-label={label}
          title={label}
          onClick={() => choose(value)}
        >
          <Icon size={14} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
