import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { loadWorkspace } from "../index.ts";
import { MemorySource } from "../test/memory-source.ts";

const settings = { "workspace.yaml": "id: acme\nname: Acme\n" };

/** The check issues of a small workspace: code, file, line and message. */
async function checkIssuesIn(files: Record<string, string>) {
  const workspace = await loadWorkspace(new MemorySource({ ...settings, ...files }));
  return workspace.issues
    .filter((issue) => issue.source === "check")
    .map(({ severity, code, file, line, message }) => ({ severity, code, file, line, message }));
}

verifies("workspace.hub-uses", () => {
  it("gives each shared item a hub's uses names that doesn't exist the agent's unknown-* error", async () => {
    const issues = await checkIssuesIn({
      "hubs/support/hub.yaml": [
        "name: Support",
        "uses:",
        "  connectors: [files]",
        "  skills: [plain, plain-words]",
        "  knowledge: [faq]",
        "  collections: [tickets]",
        "",
      ].join("\n"),
      "library/skills/plain/SKILL.md": "---\nname: Plain\ndescription: Plain.\n---\nBe plain.\n",
    });
    const file = "hubs/support/hub.yaml";
    expect(issues).toEqual([
      {
        severity: "error",
        code: "unknown-skill",
        file,
        line: 4,
        message: 'Hub "support" uses unknown skill "plain-words"',
      },
      {
        severity: "error",
        code: "unknown-knowledge",
        file,
        line: 5,
        message: 'Hub "support" uses unknown knowledge "faq"',
      },
      {
        severity: "error",
        code: "unknown-collection",
        file,
        line: 6,
        message: 'Hub "support" uses unknown collection "tickets"',
      },
      {
        severity: "error",
        code: "unknown-connector",
        file,
        line: 3,
        message: 'Hub "support" uses unknown connector "files"',
      },
    ]);
  });

  it("doesn't report a shared item whose own file failed", async () => {
    const workspace = await loadWorkspace(
      new MemorySource({
        ...settings,
        "hubs/support/hub.yaml": "name: Support\nuses:\n  skills: [plain]\n",
        "library/skills/plain/SKILL.md": "---\nname: Plain\n---\nNo description.\n",
      }),
    );
    expect(workspace.issues.map((issue) => issue.file)).toEqual(["library/skills/plain/SKILL.md"]);
  });
});
