import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { errorsStoppingRun, loadWorkspace, manyUsersUnpricedModelCode } from "../index.ts";
import { MemorySource } from "../test/memory-source.ts";

/** A `deployments.yaml` with the deployment `web` in this users block. */
function deployments(users: string): Record<string, string> {
  return { "deployments.yaml": `deployments:\n  web:\n    name: Web\n    users:\n${users}` };
}

/** `web` with many users, held by `meter: config` to these limits. */
function limitedTo(limit: string): Record<string, string> {
  return deployments(
    `      mode: many\n      meter: config\n      config:\n        limits:\n          - ${limit}\n`,
  );
}

const costLimit = limitedTo("{ unit: cost, amount: 5, period: month }");

/** The provider every alias here calls, with a key, so no other check speaks of it. */
const provider = {
  "providers/claude.yaml": "id: claude\ntype: anthropic\nsecret: anthropic-key\n",
};
const price = "price: { input: 1, output: 5 }";

/** `models.yaml` with the alias `cheap`, unpriced, and `smart`, priced, falling back to these. */
function models(smartFallback = "[]"): Record<string, string> {
  return {
    "models.yaml": `aliases:\n  cheap: { provider: claude, model: claude-haiku }\n  smart: { provider: claude, model: claude-opus, ${price}, fallback: ${smartFallback} }\n`,
  };
}

/** The support hub's agent `writer` with this `model:` line, and the workflow `reply` that runs it. */
function writer(model: string): Record<string, string> {
  return {
    "hubs/support/hub.yaml": "id: support\nname: Support\n",
    "hubs/support/agents/writer.agent.yaml": `id: writer\nname: Writer\ninstructions: Write.\n${model}`,
    "hubs/support/workflows/reply.workflow.yaml":
      "id: reply\nname: Reply\ninitial: draft\nstates:\n  draft:\n    agent: writer\n    on:\n      - to: done\n  done:\n    type: final\n",
  };
}

/** A workspace with these files, loaded. */
async function load(files: Record<string, string>) {
  const source = new MemorySource({ "workspace.yaml": "id: acme\nname: Acme\n", ...files });
  return loadWorkspace(source);
}

/** The issues of a workspace with these files, as `severity code file key.path: message`. */
async function issuesIn(files: Record<string, string>): Promise<string[]> {
  const workspace = await load({ ...provider, ...models(), ...files });
  return workspace.issues.map(
    (issue) =>
      `${issue.severity} ${issue.code} ${issue.file} ${issue.path.join(".")}: ${issue.message}`,
  );
}

const writerFile = "hubs/support/agents/writer.agent.yaml";
const intro = `Deployment "web" lets many people sign in and stops them at a cost limit, and agent "writer"`;

verifies("workspace.many-users-unpriced-model", () => {
  it("refuses an agent whose model has no price under a cost limit, at its model", async () => {
    expect(await issuesIn({ ...costLimit, ...writer("model: cheap\n") })).toEqual([
      `error ${manyUsersUnpricedModelCode} ${writerFile} model: ${intro} calls model "cheap", which has no price or falls back to one without, so its calls would count no cost. Use an alias with a price, and give each of its fallbacks one too.`,
    ]);
  });

  it("gives the code users-many-unpriced-model", () => {
    expect(manyUsersUnpricedModelCode).toBe("users-many-unpriced-model");
  });

  it("lets an agent run on a priced alias, and refuses one that falls back to an unpriced one", async () => {
    expect(await issuesIn({ ...costLimit, ...writer("model: smart\n") })).toEqual([]);
    const fallingBack = { ...costLimit, ...writer("model: smart\n"), ...models("[cheap]") };
    const [issue] = await issuesIn(fallingBack);
    expect(issue).toContain(`${writerFile} model: ${intro} calls model "smart"`);
  });

  it("refuses a model named as provider/model, which carries no price", async () => {
    const [issue] = await issuesIn({ ...costLimit, ...writer("model: claude/claude-opus\n") });
    expect(issue).toContain(`calls model "claude/claude-opus", which has no price`);
  });

  it("refuses an agent without a model when the default it calls has no price", async () => {
    const unpricedDefault = {
      "models.yaml": "aliases:\n  default: { provider: claude, model: claude-haiku }\n",
    };
    const [issue] = await issuesIn({ ...costLimit, ...writer(""), ...unpricedDefault });
    expect(issue).toContain(
      `error ${manyUsersUnpricedModelCode} ${writerFile} : ${intro} calls model "default"`,
    );
    const pricedDefault = {
      "workspace.yaml": "id: acme\nname: Acme\ndefaults: { model: smart }\n",
    };
    expect(await issuesIn({ ...costLimit, ...writer(""), ...pricedDefault })).toEqual([]);
  });

  it("refuses a harness agent without a model, at its harness: its program picks the model", async () => {
    expect(await issuesIn({ ...costLimit, ...writer("harness: claude-code\n") })).toEqual([
      `error ${manyUsersUnpricedModelCode} ${writerFile} harness: ${intro} names no model, so claude-code picks one without a price and its calls would count no cost. Set model to an alias with a price.`,
    ]);
  });

  it("counts an organisation's cost limit and a member's share of it", async () => {
    const organisation = (limits: string, memberLimits: string) =>
      deployments(
        `      mode: many\n      meter: config\n      config:\n        organisations:\n          - id: org_acme0000000000000\n            limits: ${limits}\n            members:\n              - { actor: eu_owner000000000000, role: owner, limits: ${memberLimits} }\n`,
      );
    const cost = "[{ unit: cost, amount: 5, period: day }]";
    // A share needs a pool limit on its unit; one that only notifies stops nobody.
    const notifying = "[{ unit: cost, amount: 5, period: day, action: notify }]";
    for (const [pool, share] of [
      [cost, "[]"],
      [notifying, cost],
    ] as const) {
      const issues = await issuesIn({ ...organisation(pool, share), ...writer("model: cheap\n") });
      expect(issues.map((issue) => issue.split(" ")[1])).toEqual([manyUsersUnpricedModelCode]);
    }
  });

  it("leaves an unpriced model alone without a cost limit that stops, many users or meter config", async () => {
    const cheap = writer("model: cheap\n");
    const notifying = limitedTo("{ unit: cost, amount: 5, period: month, action: notify }");
    const tokens = limitedTo("{ unit: tokens, amount: 5, period: month }");
    const owner = deployments(
      "      mode: owner\n      meter: config\n      config:\n        limits:\n          - { unit: cost, amount: 5, period: month }\n",
    );
    for (const files of [notifying, tokens, owner, {}]) {
      const issues = await issuesIn({ ...files, ...cheap });
      expect(issues.filter((issue) => issue.includes(manyUsersUnpricedModelCode))).toEqual([]);
    }
  });

  it("stops a run of a workflow that uses the agent, and not one that doesn't", async () => {
    const clerk = {
      "hubs/support/agents/clerk.agent.yaml":
        "id: clerk\nname: Clerk\ninstructions: File.\nmodel: smart\n",
      "hubs/support/workflows/file.workflow.yaml":
        "id: file\nname: File\ninitial: file\nstates:\n  file:\n    agent: clerk\n    on:\n      - to: done\n  done:\n    type: final\n",
    };
    const workspace = await load({
      ...provider,
      ...models(),
      ...costLimit,
      ...writer("model: cheap\n"),
      ...clerk,
    });
    const stops = (workflowId: string) =>
      errorsStoppingRun(workspace, workspace.issues, { hubId: "support", workflowId }).map(
        (issue) => issue.code,
      );
    expect(stops("reply")).toEqual([manyUsersUnpricedModelCode]);
    expect(stops("file")).toEqual([]);
  });
});
