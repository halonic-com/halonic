import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { loadWorkspace, manyUsersSubscriptionCode } from "../index.ts";
import { MemorySource } from "../test/memory-source.ts";

const fix =
  "Add a provider of type anthropic with a secret, and save the key with halonic secret set.";

/** A `deployments.yaml` with the deployment `web` in this users mode. */
function deployments(mode: "owner" | "many"): Record<string, string> {
  return {
    "deployments.yaml": `deployments:\n  web:\n    name: Web\n    users: { mode: ${mode} }\n`,
  };
}

const writer = { "agents/writer.agent.yaml": "name: Writer\nharness: claude-code\n" };
const keyless = { "providers/claude.yaml": "id: claude\ntype: anthropic\n" };
const keyed = { "providers/claude.yaml": "id: claude\ntype: anthropic\nsecret: anthropic-key\n" };

/** The issues of a workspace with these files, as `severity code file key.path: message`. */
async function issuesIn(files: Record<string, string>): Promise<string[]> {
  const source = new MemorySource({ "workspace.yaml": "id: acme\nname: Acme\n", ...files });
  const workspace = await loadWorkspace(source);
  return workspace.issues.map(
    (issue) =>
      `${issue.severity} ${issue.code} ${issue.file} ${issue.path.join(".")}: ${issue.message}`,
  );
}

verifies("workspace.many-users-subscription", () => {
  it("refuses a harness agent with no provider key when a deployment lets many people sign in", async () => {
    expect(await issuesIn({ ...deployments("many"), ...writer, ...keyless })).toEqual([
      `error ${manyUsersSubscriptionCode} agents/writer.agent.yaml harness: Deployment "web" lets many people sign in, and agent "writer" runs in claude-code with no provider key, so their runs would use your own sign-in. ${fix}`,
    ]);
  });

  it("gives the code users-many-subscription", () => {
    expect(manyUsersSubscriptionCode).toBe("users-many-subscription");
  });

  it("names the provider type Codex needs", async () => {
    const codex = { "agents/coder.agent.yaml": "name: Coder\nharness: codex\n" };
    const [issue] = await issuesIn({ ...deployments("many"), ...codex });
    expect(issue).toContain("Add a provider of type openai with a secret");
  });

  it("lets a harness agent run when a provider of its type has a key", async () => {
    expect(await issuesIn({ ...deployments("many"), ...writer, ...keyed })).toEqual([]);
  });

  it("lets a harness agent run on an alias of a keyed provider of a type its program calls", async () => {
    const files = {
      ...deployments("many"),
      "providers/deepseek.yaml": "id: deepseek\ntype: openai-compatible\nsecret: deepseek-key\n",
      "models.yaml": "aliases:\n  cheap: { provider: deepseek, model: deepseek-chat }\n",
      "agents/coder.agent.yaml": "name: Coder\nharness: codex\nmodel: cheap\n",
    };
    expect(await issuesIn(files)).toEqual([]);
  });

  it("refuses an alias whose provider has no key", async () => {
    const files = {
      ...deployments("many"),
      ...keyless,
      "models.yaml": "aliases:\n  smart: { provider: claude, model: claude-opus-5-5 }\n",
      "agents/writer.agent.yaml": "name: Writer\nharness: claude-code\nmodel: smart\n",
    };
    expect(await issuesIn(files)).toHaveLength(1);
  });

  it("leaves Halonic's own loop alone, and every agent when no deployment lets many people sign in", async () => {
    const own = { "agents/clerk.agent.yaml": "name: Clerk\nharness: halonic\n" };
    expect(await issuesIn({ ...deployments("many"), ...own })).toEqual([]);
    expect(await issuesIn({ ...deployments("owner"), ...writer })).toEqual([]);
    expect(await issuesIn(writer)).toEqual([]);
  });
});
