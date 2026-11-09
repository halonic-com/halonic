import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildCss, ruleSelectors } from "../src/test/build-css.spec.ts";
import { SECTIONS } from "./sections/index.ts";
import { forcedState } from "./state-table.tsx";
import { StatesPage } from "./states-page.tsx";

/*
 * Noah's rule (HAL-1564): a forced cell must get exactly what a real hover, press or focus gets,
 * or the page can look right while the part is wrong. Only a browser computes Tailwind's styles
 * (jsdom ignores @layer), so these tests check the page's real CSS, built for the classes the
 * page really renders. A forced selector in the same rule as the real one gets the same
 * declarations, at the same specificity.
 */

const statesFolder = import.meta.dirname;
const statesCss = readFileSync(path.join(statesFolder, "states.css"), "utf8");

/** Every class the whole page renders. */
function pageClasses(): string[] {
  const markup = renderToStaticMarkup(<StatesPage only={null} />);
  const classes = [...markup.matchAll(/class="([^"]*)"/g)].flatMap((match) =>
    (match[1] ?? "").split(" "),
  );
  return [...new Set(classes)].filter((name) => name !== "");
}

const pageCss = buildCss(pageClasses(), statesCss, statesFolder);

type Forced = "hover" | "active" | "focus";

/** How each state shows in a real selector. The on-muted: variant's own hover is left out. */
const real: Record<Forced, RegExp> = {
  hover: /:hover(?![^(]*data-hover-fill)/,
  active: /:active/,
  focus: /:focus-visible|:focus-within|:has\(\[data-field-text\]:focus\)/,
};

const isReal = (selector: string, state: Forced) =>
  real[state].test(selector) && !selector.includes("data-hover-fill");
const isForced = (selector: string, state: Forced) =>
  selector.includes(`[data-force-state="${state}"]`);

describe("the states page's forced states", () => {
  it.each(["hover", "active", "focus"] as const)(
    "forces %s through the same rule as the real state, for every part on the page",
    async (state) => {
      const rules = ruleSelectors(await pageCss);
      const withReal = rules.filter((selectors) => selectors.some((s) => isReal(s, state)));
      // The parts do have these states, so an empty list would mean the test checked nothing.
      expect(withReal).not.toHaveLength(0);
      for (const selectors of withReal) {
        expect(
          selectors.some((s) => isForced(s, state)),
          selectors.join(", "),
        ).toBe(true);
      }
      for (const selectors of rules.filter((list) => list.some((s) => isForced(s, state)))) {
        expect(
          selectors.some((s) => isReal(s, state)),
          selectors.join(", "),
        ).toBe(true);
      }
    },
  );

  it("forces the focus ring and the field focus on the cell and on a single target", async () => {
    const rules = ruleSelectors(
      await buildCss(["focus-ring", "focus-field"], statesCss, statesFolder),
    );
    expect(rules).toContainEqual([
      ".focus-ring:focus-visible",
      '[data-force-state="focus"] .focus-ring',
      '.focus-ring[data-force-state="focus"]',
    ]);
    expect(rules).toContainEqual([
      ".focus-field:has([data-field-text]:focus)",
      '[data-force-state="focus"] .focus-field',
      '.focus-field[data-force-state="focus"]',
    ]);
  });

  it("presses instead of hovering below 600px, where there's no hover", () => {
    const row = { name: "Hover", force: "hover", copies: () => null } as const;
    expect(forcedState(row, false)).toBe("hover");
    expect(forcedState(row, true)).toBe("active");
    expect(forcedState({ ...row, force: "focus" }, true)).toBe("focus");
  });
});

describe("the states page", () => {
  it("uses only classes that exist, so every token class is drawn", async () => {
    const css = await pageCss;
    const missing = pageClasses().filter((name) => !css.includes(`.${cssEscape(name)}`));
    expect(missing).toEqual([]);
  });

  it("draws one section per part, in spec order, and only the one ?part= names", () => {
    const all = renderToStaticMarkup(<StatesPage only={null} />);
    const ids = [...all.matchAll(/<section id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toEqual(SECTIONS.map((section) => section.id));

    const one = renderToStaticMarkup(<StatesPage only="field" />);
    expect([...one.matchAll(/<section id="([^"]+)"/g)].map((match) => match[1])).toEqual(["field"]);
  });

  it("draws every row once light and once dark", () => {
    const markup = renderToStaticMarkup(<StatesPage only="button" />);
    const rows = SECTIONS.find((section) => section.id === "button")?.rows.length ?? 0;
    expect(markup.match(/scheme-light/g)).toHaveLength(rows);
    expect(markup.match(/scheme-dark/g)).toHaveLength(rows);
  });
});

/** A class name as it appears in a CSS selector: Tailwind escapes : . / and brackets. */
function cssEscape(name: string): string {
  return name.replace(/[:./[\]()#%,&>*'"=!@]/g, (character) => `\\${character}`);
}
