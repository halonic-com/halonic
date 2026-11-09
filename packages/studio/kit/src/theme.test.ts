import { describe, expect, it } from "vitest";
import { PHONE_MAX_WIDTH } from "./index.ts";
import { blend, contrastRatio, parseColour, type Rgba } from "./test/contrast.ts";
import {
  blockBody,
  customProperties,
  lightDarkPair,
  readThemeFile,
} from "./test/theme-file.spec.ts";

const css = readThemeFile();
const themeTokens = customProperties(blockBody(css, "@theme static"));
const plainVariables = customProperties(blockBody(css, ":root"));

type Mode = "light" | "dark";

function colourToken(name: string, mode: Mode): Rgba {
  const value = themeTokens.get(`--color-${name}`);
  const pair = value === undefined ? undefined : lightDarkPair(value);
  if (pair === undefined) {
    throw new Error(`--color-${name} is missing or isn't written as light-dark().`);
  }
  return parseColour(pair[mode]);
}

/**
 * A background as the eye sees it: a see-through colour (a `-soft` badge) painted over the
 * surface beneath it. Opaque backgrounds ignore `beneath`.
 */
function backgroundToken(name: string, beneath: string, mode: Mode): Rgba {
  const colour = colourToken(name, mode);
  if (colour.alpha === 1) {
    return colour;
  }
  return blend(colour, colourToken(beneath, mode));
}

const text = 4.5;
const control = 3;

/** The surfaces text and controls sit on: pages, the sidebar, and menus, dialogs and toasts. */
const surfaces = ["surface", "surface-subtle", "surface-raised"];

/** Text or a control edge on a background, and the surface under that background. */
interface ContrastPair {
  readonly name: string;
  readonly foreground: string;
  readonly background: string;
  readonly beneath: string;
  readonly minimum: number;
}

function onSurfaces(foreground: string, minimum: number, extra: string[] = []): ContrastPair[] {
  return [...surfaces, ...extra].map((surface) => ({
    name: `${foreground} on ${surface}`,
    foreground,
    background: surface,
    beneath: surface,
    minimum,
  }));
}

/** A colour on its own see-through `-soft` fill (a status chip), over every surface. */
function onSoftFill(foreground: string, softFill: string): ContrastPair[] {
  return surfaces.map((surface) => ({
    name: `${foreground} on ${softFill} over ${surface}`,
    foreground,
    background: softFill,
    beneath: surface,
    minimum: text,
  }));
}

function onFill(foreground: string, fill: string): ContrastPair {
  return {
    name: `${foreground} on ${fill}`,
    foreground,
    background: fill,
    beneath: "surface",
    minimum: text,
  };
}

/** Every place the specs put text or a control edge. */
const contrastPairs: ContrastPair[] = [
  ...["fg", "fg-muted", "fg-subtle"].flatMap((foreground) =>
    onSurfaces(foreground, text, ["surface-muted"]),
  ),
  ...onSurfaces("accent-text", text),
  ...onSoftFill("accent-text", "accent-soft"),
  onFill("on-primary", "primary"),
  onFill("on-primary", "primary-hover"),
  onFill("on-danger", "danger"),
  onFill("on-danger", "danger-hover"),
  ...["running", "warning", "danger", "success"].flatMap((status) => [
    ...onSurfaces(status, text),
    ...onSoftFill(status, `${status}-soft`),
  ]),
  // The switch's off track and a checkbox in a hovered menu item sit on surface-muted.
  ...onSurfaces("border-control", control, ["surface-muted"]),
  ...onSurfaces("accent", control),
];

describe("theme.css colours", () => {
  it("writes every colour once for light and once for dark", () => {
    const colourNames = [...themeTokens.keys()].filter((name) => name.startsWith("--color-"));
    expect(colourNames.length).toBeGreaterThan(0);
    for (const name of colourNames) {
      const pair = lightDarkPair(themeTokens.get(name) ?? "");
      expect(pair, `${name} must be light-dark(light, dark)`).toBeDefined();
    }
  });

  for (const mode of ["light", "dark"] as const) {
    it.each(contrastPairs)(
      `keeps $name readable in ${mode} mode`,
      ({ name, foreground, background, beneath, minimum }) => {
        const ratio = contrastRatio(
          colourToken(foreground, mode),
          backgroundToken(background, beneath, mode),
        );
        expect(ratio, `${name} (${mode}) is ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(minimum);
      },
    );
  }
});

describe("theme.css focus rings", () => {
  it("never removes the outline, so the ring shows in Windows high-contrast mode", () => {
    expect(css).not.toMatch(/outline:\s*(?:none|0)\s*;/);
    expect(blockBody(css, "@utility focus-ring")).toContain("outline: 2px solid transparent;");
    expect(blockBody(css, "@utility focus-ring-inset")).toContain(
      "outline: 2px solid transparent;",
    );
  });
});

describe("theme.css selection and high contrast", () => {
  it("marks a selected row with an accent bar that turns Highlight in high-contrast mode", () => {
    const bar = blockBody(css, "@utility selected-bar");
    expect(blockBody(bar, "&::after")).toContain("width: 2px;");
    expect(blockBody(bar, "&::after")).toContain("background: var(--color-accent);");
    const forced = blockBody(bar, "@media (forced-colors: active)");
    expect(forced).toContain("forced-color-adjust: none;");
    expect(forced).toContain("background: Highlight;");
  });

  it("adds the outline and the disabled colour only in high-contrast mode", () => {
    const outline = blockBody(
      blockBody(css, "@utility selected-forced"),
      "@media (forced-colors: active)",
    );
    expect(outline).toContain("outline: 1px solid CanvasText;");
    const disabled = blockBody(
      blockBody(css, "@utility text-forced-disabled"),
      "@media (forced-colors: active)",
    );
    expect(disabled).toContain("color: GrayText;");
  });
});

describe("theme.css field focus", () => {
  it("rings a text field's box while its text has focus, and keeps the outline", () => {
    const accent = blockBody(
      blockBody(css, "@utility focus-field"),
      "&:has([data-field-text]:focus)",
    );
    expect(accent).toContain("outline: 2px solid transparent;");
    expect(accent).toContain("border-color: var(--color-accent);");
    expect(accent).toContain("box-shadow: 0 0 0 3px var(--color-accent-soft);");

    const danger = blockBody(
      blockBody(css, "@utility focus-field-danger"),
      "&:has([data-field-text]:focus)",
    );
    expect(danger).toContain("outline: 2px solid transparent;");
    expect(danger).toContain("border-color: var(--color-danger);");
    expect(danger).toContain("box-shadow: 0 0 0 3px var(--color-danger-soft);");
  });
});

describe("theme.css light and dark switch", () => {
  it("follows the system unless the app sets data-theme", () => {
    expect(blockBody(css, ":root")).toContain("color-scheme: light dark;");
    expect(blockBody(css, ':root[data-theme="light"]')).toContain("color-scheme: light;");
    expect(blockBody(css, ':root[data-theme="dark"]')).toContain("color-scheme: dark;");
  });
});

/** Names in a group, so adding or removing a token is a visible change in review. */
function namesStartingWith(source: Map<string, string>, prefix: string): string[] {
  return [...source.keys()].filter((name) => name.startsWith(prefix));
}

describe("theme.css scales", () => {
  it("starts from an empty theme, so Tailwind's own palette doesn't exist", () => {
    expect(themeTokens.get("--*")).toBe("initial");
  });

  it("has exactly the agreed radius, spacing, shadow and motion tokens", () => {
    expect(namesStartingWith(themeTokens, "--radius-")).toEqual([
      "--radius-xs",
      "--radius-sm",
      "--radius-segment",
      "--radius-md",
      "--radius-lg",
      "--radius-full",
    ]);
    expect(namesStartingWith(themeTokens, "--spacing")).toEqual([
      "--spacing",
      "--spacing-control-sm",
      "--spacing-control-md",
      "--spacing-control-lg",
      "--spacing-icon-sm",
      "--spacing-icon-md",
      "--spacing-titlebar",
      "--spacing-statusbar",
      "--spacing-sidebar",
      "--spacing-panel",
      "--spacing-touch",
      "--spacing-phone-bar",
      "--spacing-nav-pill",
    ]);
    expect(themeTokens.get("--spacing")).toBe("4px");
    expect(namesStartingWith(themeTokens, "--breakpoint-")).toEqual(["--breakpoint-wide"]);
    expect(namesStartingWith(themeTokens, "--shadow-")).toEqual([
      "--shadow-1",
      "--shadow-2",
      "--shadow-3",
    ]);
    expect(namesStartingWith(themeTokens, "--animate-")).toEqual(["--animate-spin"]);
    expect(css).toMatch(/@keyframes spin\s*\{/);
  });

  it("keeps the sizes the shell's layout is built on", () => {
    expect(themeTokens.get("--spacing-titlebar")).toBe("40px");
    expect(themeTokens.get("--spacing-statusbar")).toBe("24px");
    expect(themeTokens.get("--spacing-sidebar")).toBe("264px");
    expect(themeTokens.get("--spacing-panel")).toBe("360px");
    expect(themeTokens.get("--breakpoint-wide")).toBe("900px");
  });

  it("has exactly the agreed layers and durations", () => {
    expect(namesStartingWith(plainVariables, "--layer-")).toEqual([
      "--layer-sticky",
      "--layer-dropdown",
      "--layer-overlay",
      "--layer-dialog",
      "--layer-toast",
      "--layer-tooltip",
    ]);
    expect(namesStartingWith(plainVariables, "--duration-")).toEqual([
      "--duration-fast",
      "--duration-base",
      "--duration-slow",
    ]);
  });
});

describe("theme.css on a phone", () => {
  it("has a phone: variant below 600px and no phone breakpoint token", () => {
    expect(css).toContain("@custom-variant phone (@media (width < 600px));");
    expect(themeTokens.has("--breakpoint-phone")).toBe(false);
  });

  it("exports the same width the phone: variant uses", () => {
    const variantWidth = /@custom-variant phone \(@media \(width < (\d+)px\)\);/.exec(css)?.[1];
    expect(Number(variantWidth)).toBe(PHONE_MAX_WIDTH);
    expect(PHONE_MAX_WIDTH).toBe(600);
  });

  it("keeps the touch sizes", () => {
    expect(themeTokens.get("--spacing-touch")).toBe("48px");
    expect(themeTokens.get("--spacing-phone-bar")).toBe("56px");
    expect(themeTokens.get("--spacing-nav-pill")).toBe("56px");
    expect(themeTokens.get("--text-input-touch")).toBe("16px");
    expect(themeTokens.get("--text-input-touch--line-height")).toBe("24px");
    expect(themeTokens.get("--text-input-touch--font-weight")).toBe("400");
  });

  it("reads the safe areas once, and pads with the larger of 12px and the home bar", () => {
    expect(plainVariables.get("--safe-top")).toBe("env(safe-area-inset-top)");
    expect(plainVariables.get("--safe-bottom")).toBe("env(safe-area-inset-bottom)");
    expect(blockBody(css, "@utility pt-safe")).toContain("padding-top: var(--safe-top);");
    expect(blockBody(css, "@utility pb-safe")).toContain(
      "padding-bottom: max(12px, var(--safe-bottom));",
    );
    expect(blockBody(css, "@utility pb-safe-inset")).toContain(
      "padding-bottom: var(--safe-bottom);",
    );
  });
});

describe("theme.css on a touch screen", () => {
  it("has a touch: variant that follows the pointer, not the width", () => {
    expect(css).toContain("@custom-variant touch (@media (pointer: coarse));");
  });

  it("draws the 48px hit area outside the control, never smaller than the control", () => {
    const hitArea = blockBody(css, "@utility hit-touch");
    expect(hitArea).toContain("position: relative;");
    expect(blockBody(hitArea, "&::after")).toContain(
      "inset-block: min(0px, calc((100% - var(--spacing-touch)) / 2));",
    );
    expect(blockBody(hitArea, "&::after")).toContain(
      "inset-inline: min(0px, calc((100% - var(--spacing-touch)) / 2));",
    );
  });
});
