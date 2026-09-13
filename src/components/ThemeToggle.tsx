import { Moon, Sun } from "lucide-react";
import { cn } from "../lib/utils";
import { toggleTheme, useTheme } from "../lib/theme";

/**
 * Dark / light switch.
 *
 * The glyph shows the theme you are in, and the label says what pressing it
 * will do — so it reads the same whether you look at it or listen to it.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useTheme();
  const dark = theme === "dark";
  const label = dark ? "Switch to light theme" : "Switch to dark theme";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded text-ink-500 transition-colors duration-75 hover:bg-surface hover:text-ink-900",
        className,
      )}
    >
      {dark ? (
        <Sun className="size-3.5" strokeWidth={1.9} aria-hidden="true" />
      ) : (
        <Moon className="size-3.5" strokeWidth={1.9} aria-hidden="true" />
      )}
    </button>
  );
}
