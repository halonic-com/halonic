import { describe, expect, it } from "vitest";
import { purposePlaceholder } from "../rules/agents-md.ts";
import { type FixturePackage, runChecks, std } from "./fixture-repo.ts";

const header = (owner: string, layer: string): string =>
  `# x\n\nOwner: ${owner} · Layer: ${layer} · Read the root \`AGENTS.md\` first.\n\n## Scope\n\nDoes one thing.\n`;

function withAgentsMd(text: string): FixturePackage {
  return { ...std, files: { "src/index.ts": "export const x = 1;\n", "AGENTS.md": text } };
}

function messages(pkg: FixturePackage): string[] {
  return runChecks([pkg], { coreOrder: ["@halonicjs/std"] })
    .filter((problem) => problem.rule === "agents-md")
    .map((problem) => problem.message);
}

describe("tooling/check: agents-md", () => {
  it("passes a package whose AGENTS.md matches its package.json", () => {
    expect(messages(withAgentsMd(header("mateo", "core")))).toEqual([]);
  });

  it("flags a package without AGENTS.md", () => {
    const problems = runChecks([{ ...std, withoutAgentsMd: true }], {
      coreOrder: ["@halonicjs/std"],
    }).filter((problem) => problem.rule === "agents-md");
    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toContain("packages/core/std has no AGENTS.md");
  });

  it("flags an owner that differs from package.json", () => {
    expect(messages(withAgentsMd(header("elena", "core")))).toEqual([
      'Owner in packages/core/std/AGENTS.md is "elena" but package.json says "mateo". Make them the same.',
    ]);
  });

  it("flags a layer that differs from package.json", () => {
    expect(messages(withAgentsMd(header("mateo", "studio")))).toEqual([
      'Layer in packages/core/std/AGENTS.md is "studio" but package.json says "core". Make them the same.',
    ]);
  });

  it("flags a deleted Owner line", () => {
    expect(messages(withAgentsMd("# x\n\nDoes one thing.\n"))).toEqual([
      expect.stringContaining('The "Owner: … · Layer: …" line is missing'),
    ]);
  });

  it("flags a purpose line that was never filled in", () => {
    const text = `${header("mateo", "core")}\n${purposePlaceholder}\n`;
    expect(messages(withAgentsMd(text))).toEqual([
      `Fill in the purpose line in packages/core/std/AGENTS.md (replace "${purposePlaceholder}" with one sentence).`,
    ]);
  });
});
