import type { Digest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  definitionsOf,
  definitionsVersion,
  loadWorkspace,
  maxRuleFileBytes,
  runDefinitionsOf,
} from "./index.ts";
import { MemorySource } from "./test/memory-source.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const matchRule = "export function run(ctx) {\n  return { merge: ctx.input.prs };\n}\n";

/** A workflow whose one step runs the rule at `rule`. */
function ruleWorkflow(id: string, rule: string): string {
  return [
    `id: ${id}`,
    `name: ${id}`,
    "initial: pick",
    "states:",
    "  pick:",
    "    type: rule",
    `    rule: ${rule}`,
    "    input:",
    "      prs: open",
    "    output: decisions",
    "    on:",
    "      - to: done",
    "        event: done",
    "  done:",
    "    type: final",
    "",
  ].join("\n");
}

const plainWorkflow = [
  "id: tidy",
  "name: tidy",
  "initial: work",
  "states:",
  "  work:",
  "    agent: helper",
  "    on:",
  "      - to: done",
  "  done:",
  "    type: final",
  "",
].join("\n");

const base: Record<string, string> = {
  "workspace.yaml": "id: acme\nname: Acme\ndefaults:\n  model: fast\n",
  "providers/mock.yaml": "id: mock\nname: Mock\ntype: mock\nlocal: true\n",
  "models.yaml": "aliases:\n  fast:\n    provider: mock\n    model: echo\n",
  "hubs/acme/hub.yaml": "id: acme\nname: Acme\n",
  "hubs/acme/agents/helper.agent.yaml": "id: helper\nname: helper\ninstructions: Help.\n",
  "hubs/acme/workflows/tidy.workflow.yaml": plainWorkflow,
};

const withRule: Record<string, string> = {
  ...base,
  "hubs/acme/workflows/watch.workflow.yaml": ruleWorkflow("watch", "rules/match.rule.js"),
  "hubs/acme/rules/match.rule.js": matchRule,
};

function errorsOf(workspace: Awaited<ReturnType<typeof loadWorkspace>>) {
  return workspace.issues.filter((issue) => issue.severity === "error");
}

verifies("workspace.rule-files", () => {
  it("gives a run the text of each rule file its hub's workflows name", async () => {
    const workspace = await loadWorkspace(new MemorySource(withRule));
    expect(errorsOf(workspace)).toEqual([]);

    const run = runDefinitionsOf(workspace, "acme", "watch");

    expect(run.rules).toEqual({ "rules/match.rule.js": matchRule });
    expect(definitionsOf(workspace, "acme").rules).toEqual({ "rules/match.rule.js": matchRule });
  });

  it("reports a rule file the hub doesn't have, and leaves it out of the run", async () => {
    const { "hubs/acme/rules/match.rule.js": _, ...missing } = withRule;
    const workspace = await loadWorkspace(new MemorySource(missing));

    expect(errorsOf(workspace)).toEqual([
      expect.objectContaining({
        file: "hubs/acme/workflows/watch.workflow.yaml",
        code: "rule-file-missing",
        path: ["states", "pick", "rule"],
        message: expect.stringContaining("rules/match.rule.js"),
        line: 7,
      }),
    ]);
    expect(runDefinitionsOf(workspace, "acme", "watch")).not.toHaveProperty("rules");
  });

  it("looks for a rule file in the workflow's hub, not at the root or in another hub", async () => {
    const elsewhere = { ...withRule };
    delete elsewhere["hubs/acme/rules/match.rule.js"];
    elsewhere["rules/match.rule.js"] = matchRule;
    elsewhere["hubs/other/rules/match.rule.js"] = matchRule;
    const workspace = await loadWorkspace(new MemorySource(elsewhere));

    expect(errorsOf(workspace).map((issue) => issue.code)).toEqual(["rule-file-missing"]);
    expect(definitionsOf(workspace, "acme")).not.toHaveProperty("rules");
  });

  it("reports a rule file over the size limit, and leaves it out of the run", async () => {
    const tooLarge = `// ${"x".repeat(maxRuleFileBytes)}\n`;
    const workspace = await loadWorkspace(
      new MemorySource({ ...withRule, "hubs/acme/rules/match.rule.js": tooLarge }),
    );

    expect(errorsOf(workspace)).toEqual([
      expect.objectContaining({ code: "rule-file-too-large", path: ["states", "pick", "rule"] }),
    ]);
    expect(runDefinitionsOf(workspace, "acme", "watch")).not.toHaveProperty("rules");
  });

  it("takes a rule file of exactly the size limit", async () => {
    const atLimit = "x".repeat(maxRuleFileBytes);
    const workspace = await loadWorkspace(
      new MemorySource({ ...withRule, "hubs/acme/rules/match.rule.js": atLimit }),
    );

    expect(errorsOf(workspace)).toEqual([]);
    expect(runDefinitionsOf(workspace, "acme", "watch").rules).toEqual({
      "rules/match.rule.js": atLimit,
    });
  });

  it("gives a hub with no rule steps no `rules`, and the version it had before", async () => {
    const workspace = await loadWorkspace(new MemorySource(base));
    const definitions = definitionsOf(workspace, "acme");

    expect(definitions).not.toHaveProperty("rules");
    expect(runDefinitionsOf(workspace, "acme", "tidy")).not.toHaveProperty("rules");
    // The version of these definitions before rule files were read (main at 4f76b28).
    expect(await definitionsVersion(definitions, digest)).toBe(versionBefore);
  });
});

const versionBefore = "046f08290b44d1388d16c26c8262404556227316ffeb231a634163edc3e7fcff";
