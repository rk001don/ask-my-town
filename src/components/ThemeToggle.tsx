import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { applyThemeChoice, readThemeChoice, type ThemeChoice } from "@/lib/theme";

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "system", label: "Auto", Icon: Monitor },
  { value: "dark", label: "Dark", Icon: Moon },
];

/**
 * Three-way theme control: Light / Auto / Dark.
 *
 * "Auto" is offered explicitly (rather than a two-state switch) because it's
 * the default, and without it there'd be no way back to following the device
 * once someone had picked a side.
 */
export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setChoice(readThemeChoice());
    setMounted(true);
  }, []);

  function pick(next: ThemeChoice) {
    setChoice(next);
    applyThemeChoice(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="flex rounded-full border border-[color:var(--border-strong)] bg-[color:var(--bg-elevated-2)] p-1"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        // Before hydration we don't know the stored choice, so nothing is
        // marked active -- picking one at random would visibly flip.
        const active = mounted && choice === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => pick(value)}
            className={`tap-scale grid h-8 w-9 place-items-center rounded-full transition-colors ${
              active
                ? "accent-gradient"
                : "text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
            }`}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
