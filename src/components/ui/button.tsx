import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium transition-colors duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-40 disabled:active:translate-y-0 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /** The one filled control in the interface. Blue, like a link you can press.
            `accent-solid` rather than `accent`: the fill has to stay dark enough
            for white type in both themes, which the link blue does not. */
        primary: "bg-accent-solid text-white hover:bg-accent-solid-hover",
        secondary: "border border-line-strong bg-surface text-ink-900 hover:bg-sunken",
        ghost: "text-ink-600 hover:bg-sunken hover:text-ink-900",
        quiet: "border border-transparent text-ink-500 hover:border-line hover:text-ink-900",
        danger: "border border-line-strong bg-surface text-state-human hover:bg-state-human-soft",
      },
      size: {
        sm: "h-8 px-3.5 text-micro [&_svg]:size-3.5",
        md: "h-9 px-4 text-body [&_svg]:size-4",
        lg: "h-11 px-5 text-read [&_svg]:size-4",
        icon: "size-9 [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";

export { buttonVariants };
