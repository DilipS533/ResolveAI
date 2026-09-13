import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const base =
  "w-full rounded border border-line-strong bg-surface text-ink-900 transition-colors placeholder:text-ink-300 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(base, "h-8 px-2.5 text-body", className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(base, "resize-none px-3 py-2.5 text-read leading-relaxed", className)}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

/** A bordered segment for mutually exclusive choices. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
  ariaLabel,
}: {
  value: T;
  options: readonly T[];
  onChange: (next: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("inline-flex rounded border border-line-strong bg-surface p-px", className)}
    >
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          onClick={() => onChange(option)}
          className={cn(
            "rounded-full px-2.5 py-1 text-micro font-medium transition-colors duration-150",
            value === option
              ? "bg-sunken text-ink-900"
              : "text-ink-500 hover:text-ink-800",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
