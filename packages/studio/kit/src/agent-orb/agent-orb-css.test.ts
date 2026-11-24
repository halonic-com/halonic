import { readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";

const css = readFileSync(new URL("./agent-orb.css", import.meta.url), "utf8");

/** The declarations of one rule in the orb's CSS, by its selector inside `@utility agent-orb`. */
function ruleOf(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start));
}

verifies("kit.agent-orb", () => {
  it("draws each box size with the ring inside it", () => {
    expect(css).toContain("--orb-box: 24px;");
    expect(ruleOf('&[data-size="16"]')).toContain("--orb-box: 16px;");
    expect(ruleOf('&[data-size="64"]')).toContain("--orb-box: 64px;");
    expect(ruleOf("&::before")).toContain("inset: calc(var(--orb-ring) + var(--orb-gap));");
    expect(ruleOf("&::after")).toContain("inset: 0;");
  });

  it("rings working states in running, thinking dashed, and the others in their status colours", () => {
    expect(ruleOf('&[data-state="work"]')).toContain("--orb-ring-color: var(--color-running);");
    expect(ruleOf('&[data-state="think"]')).toContain("--orb-ring-style: dashed;");
    expect(ruleOf('&[data-state="needs"]')).toContain("var(--color-warning)");
    expect(ruleOf('&[data-state="error"]')).toContain("var(--color-danger)");
    expect(ruleOf('&[data-state="done"]')).toContain("var(--color-success)");
    expect(ruleOf('&[data-state="listen"]::after')).toContain("var(--color-border-control)");
    expect(ruleOf('&[data-state="sleep"]::before')).toContain("opacity: 0.4;");
    expect(css).not.toContain("--color-accent");
  });
});
