/**
 * OpenLoop design tokens.
 *
 * Every colour in the interface is a semantic name — `canvas`, `surface`,
 * `ink-500`, `accent`, `state-waiting` — and every one of those names resolves
 * to a CSS variable defined in `src/index.css` (`:root` for light, `.dark` for
 * dark). Components therefore never name a colour, only a role, which is what
 * lets the whole product switch theme without a single `dark:` variant.
 */

/** `v("ink-500")` → `rgb(var(--c-ink-500) / <alpha-value>)`, so opacity
 *  modifiers (`bg-canvas/80`, `ring-accent/40`) keep working. */
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    fontFamily: {
      sans: [
        "Inter",
        "-apple-system",
        "BlinkMacSystemFont",
        "SF Pro Text",
        "Segoe UI",
        "Roboto",
        "Helvetica Neue",
        "Arial",
        "sans-serif",
      ],
      /** Kept as an alias so existing `font-display` usages resolve to the same
       *  sans stack. Headings are type, not a separate typeface. */
      display: [
        "Inter",
        "-apple-system",
        "BlinkMacSystemFont",
        "SF Pro Display",
        "Segoe UI",
        "Roboto",
        "Helvetica Neue",
        "Arial",
        "sans-serif",
      ],
      /** Machine data only: identifiers, tool names, raw fields. Never prose. */
      mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
    },
    /**
     * Sizes are set for readability first: nothing a person has to read is
     * smaller than 12.5px, and nothing is set in uppercase.
     */
    fontSize: {
      label: ["11.5px", { lineHeight: "16px" }],
      micro: ["12.5px", { lineHeight: "18px" }],
      body: ["14px", { lineHeight: "21px" }],
      read: ["16px", { lineHeight: "25px" }],
      title: ["17px", { lineHeight: "24px" }],
      heading: ["22px", { lineHeight: "28px" }],
      page: ["30px", { lineHeight: "36px" }],
      hero: ["48px", { lineHeight: "52px" }],
    },
    borderRadius: {
      none: "0px",
      sm: "3px",
      DEFAULT: "4px",
      md: "6px",
      lg: "8px",
      xl: "12px",
      "2xl": "16px",
      full: "9999px",
    },
    borderColor: ({ theme }) => ({ ...theme("colors"), DEFAULT: v("line") }),
    colors: {
      transparent: "transparent",
      current: "currentColor",
      inherit: "inherit",
      white: "#FFFFFF",
      black: "#000000",

      /* Depth. `canvas` is the page, `surface` is anything that sits above it,
         `sunken` is the recessed chrome (rail, alternating band), `raised` is a
         hover fill. Light and dark keep the same relationships. */
      canvas: v("canvas"),
      surface: v("surface"),
      sunken: v("sunken"),
      raised: v("raised"),

      /* Hairlines do the structural work that cards used to. */
      line: {
        DEFAULT: v("line"),
        strong: v("line-strong"),
        faint: v("line-faint"),
      },

      /**
       * Text scale.
       *
       * In both themes 500 and darker clears 4.5:1 against the surface it sits
       * on — that is the *lowest* weight used for anything readable. 400 and
       * lighter are decoration only (icons, rules, dots).
       */
      ink: {
        900: v("ink-900"),
        800: v("ink-800"),
        700: v("ink-700"),
        600: v("ink-600"),
        500: v("ink-500"),
        400: v("ink-400"),
        300: v("ink-300"),
        200: v("ink-200"),
        100: v("ink-100"),
      },

      /**
       * One action colour.
       *
       * `accent` is the *text and rule* blue (links, focus, selected nav) and is
       * tuned per theme to stay legible on that theme's ground. `accent-solid`
       * is the filled-button blue, which must stay dark enough for white type —
       * the two diverge in dark mode, where a single value cannot do both.
       */
      accent: {
        DEFAULT: v("accent"),
        hover: v("accent-hover"),
        solid: v("accent-solid"),
        "solid-hover": v("accent-solid-hover"),
        soft: v("accent-soft"),
        line: v("accent-line"),
      },

      /* Semantic status. A dot and a word — never a filled surface. */
      state: {
        active: { DEFAULT: v("state-active"), soft: v("state-active-soft") },
        waiting: { DEFAULT: v("state-waiting"), soft: v("state-waiting-soft") },
        human: { DEFAULT: v("state-human"), soft: v("state-human-soft") },
        risk: { DEFAULT: v("state-risk"), soft: v("state-risk-soft") },
        resolved: { DEFAULT: v("state-resolved"), soft: v("state-resolved-soft") },
      },
    },
    extend: {},
  },
  plugins: [],
};
