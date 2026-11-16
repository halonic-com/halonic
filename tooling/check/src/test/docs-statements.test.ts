import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../../../", import.meta.url);

function doc(path: string): string {
  return readFileSync(new URL(path, root), "utf8").replace(/\s+/g, " ");
}

describe("public docs: statements that were once true", () => {
  it("say the requirement guard blocks", () => {
    for (const path of ["CONTRIBUTING.md", "README.md"]) {
      expect(doc(path), path).not.toMatch(/only reports|reports without blocking|doesn't block/);
    }
  });

  it("name the targets, serve and the cloud runtime that exist", () => {
    expect(doc("CONTRIBUTING.md")).not.toContain("There are no targets yet");
    expect(doc("SECURITY.md")).not.toContain("`halonic serve` is not built yet");
    expect(doc("docs/guides/dependencies.md")).not.toContain("`main` has no cloud runtime");
  });
});

describe("threat model: marks that went stale", () => {
  const threatModel = doc("docs/security/threat-model.md");

  it("has no 'Lands with #1894' or 'In review' mark", () => {
    expect(threatModel).not.toContain("Lands with #1894");
    expect(threatModel).not.toMatch(/\*\*In review\*\*/);
  });

  it("marks what Studio does today as built", () => {
    expect(threatModel).not.toContain("doesn't check workspace trust yet");
    expect(threatModel).not.toContain("Studio doesn't start it yet");
    expect(threatModel).not.toContain("so no app uses the host today");
    expect(threatModel).not.toContain("Studio **Planned** (phase 2, plan HAL-9)");
    expect(doc("docs/security/trust.md")).not.toContain("Studio doesn't show this check");
  });

  it("says Halonic's own record and memory tools run without approval", () => {
    expect(threatModel).toContain("declare no risk, so a run counts them as `read`");
  });

  it("marks each cloud deployment row", () => {
    const section = threatModel.slice(threatModel.indexOf("## 6. Cloud deployments"));
    expect(section).toContain("| Threat | Mitigation | Mark |");
    expect(section).not.toContain("Not built yet");
  });
});
