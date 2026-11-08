import { describe, expect, it } from "vitest";
import { blend, contrastRatio, parseColour, type Rgba } from "./test/contrast.ts";
import { blockBody, customProperties, lightDarkPair, readThemeFile } from "./test/theme-file.ts";

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

/** A background as the eye sees it: a see-through colour (a `-soft` badge) over the surface. */
function backgroundToken(name: string, mode: Mode): Rgba {
  const colour = colourToken(name, mode);
  if (colour.alpha === 1) {
    return colour;
  }
  return blend(colour, colourToken("surface", mode));
}

const text = 4.5;
const control = 3;

/** [foreground, background, minimum]: every place the specs put text or a control edge. */
const contrastPairs: ReadonlyArray<readonly [string, string, number]> = [
  ...["surface", "surface-subtle", "surface-muted", "surface-raised"].flatMap((background) =>
    ["fg", "fg-muted", "fg-subtle"].map((foreground) => [foreground, background, text] as const),
  ),
  ["accent-text", "surface", text],
  ["accent-text", "surface-subtle", text],
  ["on-primary", "primary", text],
  ["on-primary", "primary-hover", text],
  ["on-danger", "danger", text],
  ["on-danger", "danger-hover", text],
  ...["running", "warning", "danger", "success"].flatMap((status) => [
    [status, "surface", text] as const,
    [status, `${status}-soft`, text] as const,
  ]),
  ["accent-text", "accent-soft", text],
  ["border-control", "surface", control],
  ["accent", "surface", control],
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
    it.each(contrastPairs)(`keeps %s on %s readable in ${mode} mode`, (fg, bg, minimum) => {
      const ratio = contrastRatio(colourToken(fg, mode), backgroundToken(bg, mode));
      expect(ratio, `${fg} on ${bg} (${mode}) is ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
        minimum,
      );
    });
  }
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
    ]);
    expect(themeTokens.get("--spacing")).toBe("4px");
    expect(namesStartingWith(themeTokens, "--shadow-")).toEqual([
      "--shadow-1",
      "--shadow-2",
      "--shadow-3",
    ]);
    expect(namesStartingWith(themeTokens, "--animate-")).toEqual(["--animate-spin"]);
    expect(css).toMatch(/@keyframes spin\s*\{/);
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
