import type { Digest } from "@halonicjs/ports";
import { contentDigest } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { ReviewService } from "./review-service.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";
import { missingKinds } from "./try-it-cant-try.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const k1 = { chatId: "c1", cardId: "k1" };

const triage = "hubs/support/workflows/triage.workflow.yaml";
const sorter = "hubs/support/agents/sorter.agent.yaml";
const writer = "hubs/support/agents/writer.agent.yaml";
const mailer = "hubs/support/agents/mailer.agent.yaml";
const mail = "library/connectors/mail.connector.yaml";
const billingAgent = "hubs/billing/agents/clerk.agent.yaml";

const fast = "aliases:\n  fast:\n    provider: mock\n    model: echo\n";

function agent(id: string, more = ""): string {
  return `id: ${id}\nname: ${id}\ninstructions: Help.\nmodel: fast\n${more}`;
}

/** Workflow `triage`: step `sort` runs `sorter`, then step `reply` runs `writer`, and extra steps if given. */
function workflow(extra: { readonly step: string; readonly agent: string } | null = null): string {
  const lines = ["id: triage", "name: Triage", "initial: sort", "states:"];
  lines.push("  sort:", "    agent: sorter", "    on:", "      - to: reply");
  const next = extra === null ? "done" : extra.step;
  lines.push("  reply:", "    agent: writer", "    on:", `      - to: ${next}`);
  if (extra !== null) {
    lines.push(`  ${extra.step}:`, `    agent: ${extra.agent}`, "    on:", "      - to: done");
  }
  lines.push("  done:", "    type: final", "");
  return lines.join("\n");
}

/** An agent's method `summarize`, which takes no input. */
const summarize =
  "methods:\n  summarize:\n    description: Sum up.\n    input: []\n    instructions: Sum up.\n";

/** Workflow `triage` with step `reply` calling the writer's `summarize`. */
const callsSummarize = workflow().replace(
  "    agent: writer\n",
  "    agent: writer\n    method: summarize\n",
);

/** Acme's files: a support hub with workflow `triage`, and a billing hub. */
const acmeFiles: Readonly<Record<string, string>> = {
  "workspace.yaml": "id: acme\nname: Acme\n",
  "providers/mock.yaml": "id: mock\nname: Mock\ntype: mock\nlocal: true\n",
  "models.yaml": fast,
  "hubs/support/hub.yaml": "id: support\nname: Support\n",
  "hubs/billing/hub.yaml": "id: billing\nname: Billing\n",
  [triage]: workflow(),
  [sorter]: agent("sorter"),
  [writer]: agent("writer"),
  [billingAgent]: agent("clerk"),
};

/** Acme's workspace with the trust the test sets. */
function acme() {
  const store = new TestDefinitionStore(acmeFiles, digest);
  let trusted = true;
  const review = new ReviewService({
    store,
    records: new TestDefinitionStore({}, digest),
    digest,
    isTrusted: () => trusted,
  });
  /** Writes `content` as the assistant, over what the file holds now. */
  const propose = async (path: string, content: string) => {
    const current = store.files.get(path);
    const expected = current === undefined ? "absent" : await contentDigest(current, digest);
    expect((await review.propose({ path, content, expected, card: k1 })).status).toBe("written");
  };
  const setTrusted = (value: boolean) => {
    trusted = value;
  };
  return { store, review, propose, setTrusted };
}

/** For each code in `missingKinds`, the files that break Acme's workspace so its checks give that code. */
const breaksFor: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "unknown-model-alias": { [writer]: agent("writer").replace("model: fast", "model: large") },
  "unknown-fallback": { "models.yaml": `${fast}    fallback: [slow]\n` },
  "unknown-provider": { "models.yaml": fast.replace("provider: mock", "provider: cloud") },
  "unknown-connector": { [writer]: agent("writer", "connectors: [mail]\n") },
  "unknown-knowledge": { [writer]: agent("writer", "knowledge: [handbook]\n") },
  "unknown-skill": { [writer]: agent("writer", "skills: [plain-words]\n") },
  "unknown-collection": { [writer]: agent("writer", "collections: [invoices]\n") },
  "shared-not-in-uses": {
    "hubs/support/hub.yaml": "id: support\nname: Support\nuses:\n  connectors: []\n",
    [mail]: "transport:\n  http:\n    url: https://mail.example.test/mcp\n",
    [writer]: agent("writer", "connectors: [mail]\n"),
  },
  "unknown-agent": { [triage]: workflow({ step: "send", agent: "mailer" }) },
  "unknown-subagent": { [writer]: agent("writer", "subagents: [mailer]\n") },
  "unknown-workflow": {
    [triage]: workflow().replace(
      "    agent: writer\n",
      "    type: workflow\n    workflow: escalate\n",
    ),
  },
  "unknown-method": { [triage]: callsSummarize },
  "missing-argument": {
    [writer]: agent("writer", summarize.replace("input: []", "input: [text]")),
    [triage]: callsSummarize,
  },
};

verifies("app.review-try-it-cant-try", () => {
  it("can try every step when nothing it reads is left out", async () => {
    const { review, propose } = acme();
    await propose(writer, agent("writer").replace("Help.", "Answer kindly."));
    const { cantTry, leftOut } = await review.tryItSource({ item: triage });
    expect(cantTry).toEqual([]);
    expect(leftOut.total).toBe(0);
  });

  it("can't try the step whose agent uses an alias only the left-out models.yaml adds", async () => {
    const { review, propose } = acme();
    await propose("models.yaml", `${fast}  large:\n    provider: mock\n    model: big\n`);
    await propose(writer, agent("writer").replace("model: fast", "model: large"));
    const { cantTry, leftOut } = await review.tryItSource({ item: triage });
    expect(cantTry).toEqual([
      {
        status: "cant-try",
        item: triage,
        step: "reply",
        reason: { kind: "needs-left-out-change", path: "models.yaml", leftOut: "models" },
      },
    ]);
    expect(leftOut.files.map((file) => file.path)).toEqual(["models.yaml"]);
  });

  it("tries every step when only the assistant's model needs a left-out alias", async () => {
    const { review, propose } = acme();
    await propose("models.yaml", `${fast}  large:\n    provider: mock\n    model: big\n`);
    await propose("workspace.yaml", "id: acme\nname: Acme\nassistant:\n  model: large\n");
    const { cantTry, leftOut } = await review.tryItSource({ item: triage });
    expect(cantTry).toEqual([]);
    expect(leftOut.files.map((file) => file.path)).toEqual(["models.yaml"]);
  });

  it("tries an agent without a new connection, which is left out", async () => {
    const { review, propose } = acme();
    await propose(mail, "transport:\n  http:\n    url: https://mail.example.test/mcp\n");
    await propose(sorter, agent("sorter", "connectors: [mail]\n"));
    const { cantTry, leftOut } = await review.tryItSource({ item: triage });
    expect(cantTry).toEqual([]);
    expect(leftOut.files.map(({ path, reason }) => ({ path, reason }))).toEqual([
      { path: sorter, reason: "connections" },
      { path: mail, reason: "connections" },
    ]);
  });

  it("can't try a step that calls a new agent that is left out, nor that agent itself", async () => {
    const { review, propose } = acme();
    await propose(mail, "transport:\n  http:\n    url: https://mail.example.test/mcp\n");
    await propose(mailer, agent("mailer", "connectors: [mail]\n"));
    await propose(triage, workflow({ step: "send", agent: "mailer" }));
    const reason = { kind: "needs-left-out-change", path: mailer, leftOut: "connections" };
    expect((await review.tryItSource({ item: triage })).cantTry).toEqual([
      { status: "cant-try", item: triage, step: "send", reason },
    ]);
    expect((await review.tryItSource({ item: mailer })).cantTry).toEqual([
      { status: "cant-try", item: mailer, step: null, reason },
    ]);
  });

  it("can't try a step whose agent doesn't load as it was before trust", async () => {
    const { store, review, propose, setTrusted } = acme();
    setTrusted(false);
    await propose(sorter, agent("sorter").replace("model: fast", "model: large"));
    setTrusted(true);
    // The person renames the alias the old sorter used.
    await store.write("models.yaml", fast.replace("fast:", "large:"));
    await store.write(writer, agent("writer").replace("model: fast", "model: large"));
    const { cantTry, leftOut } = await review.tryItSource({ item: triage });
    expect(cantTry).toEqual([
      {
        status: "cant-try",
        item: triage,
        step: "sort",
        reason: {
          kind: "invalid-without-change",
          path: sorter,
          message: 'Agent "sorter" uses unknown model alias "fast"',
        },
      },
    ]);
    expect(leftOut).toMatchObject({ total: 1, beforeTrust: 1 });
  });

  it("blames a method only the left-out agent has on that agent, not another left-out file", async () => {
    const { review, propose, setTrusted } = acme();
    setTrusted(false);
    await propose(writer, agent("writer", summarize));
    setTrusted(true);
    await propose(sorter, agent("sorter", "maxSteps: 50\n"));
    await propose(triage, callsSummarize);
    const { cantTry, leftOut } = await review.tryItSource({ item: triage });
    expect(cantTry).toEqual([
      {
        status: "cant-try",
        item: triage,
        step: "reply",
        reason: { kind: "needs-left-out-change", path: writer, leftOut: "before-trust" },
      },
    ]);
    expect(leftOut.files.map((file) => file.path).sort()).toEqual([sorter, writer]);
  });

  it("with two left-out agents, blames the one the broken step calls", async () => {
    const { review, propose } = acme();
    await propose(sorter, agent("sorter", "maxSteps: 50\n"));
    // A new method with its own step limit is left out whole.
    await propose(writer, agent("writer", `${summarize}    maxSteps: 3\n`));
    await propose(triage, callsSummarize);
    expect((await review.tryItSource({ item: triage })).cantTry).toEqual([
      {
        status: "cant-try",
        item: triage,
        step: "reply",
        reason: { kind: "needs-left-out-change", path: writer, leftOut: "permissions" },
      },
    ]);
  });

  it("can't try a left-out item whose baseline doesn't load, and says why", async () => {
    const { store, review, propose, setTrusted } = acme();
    await store.write(sorter, "id: [sorter\n");
    setTrusted(false);
    await propose(sorter, agent("sorter"));
    setTrusted(true);
    const { cantTry } = await review.tryItSource({ item: sorter });
    expect(cantTry).toEqual([
      {
        status: "cant-try",
        item: sorter,
        step: null,
        reason: { kind: "invalid-without-change", path: sorter, message: expect.any(String) },
      },
    ]);
  });

  it("counts only what the item's run reads", async () => {
    const { review, propose } = acme();
    await propose(billingAgent, agent("clerk", "maxSteps: 50\n"));
    expect((await review.tryItSource({ item: triage })).leftOut.total).toBe(0);
    expect((await review.tryItSource({ item: billingAgent })).leftOut.files).toEqual([
      { path: billingAgent, reason: "permissions", changes: 1 },
    ]);
    expect((await review.tryItSource()).leftOut.total).toBe(1);
  });

  it("counts a changed file that isn't an item for every run, and can still try it", async () => {
    const { review, propose } = acme();
    await propose("scripts/send.sh", "#!/bin/sh\necho sent\n");
    const { leftOut, cantTry } = await review.tryItSource({ item: triage });
    expect(leftOut.files).toEqual([
      { path: "scripts/send.sh", reason: "trust-and-sandbox", changes: 1 },
    ]);
    expect(cantTry).toEqual([]);
  });

  it("loads both from one read of each file, so a save between the loads isn't a difference", async () => {
    const { store, review, propose } = acme();
    await propose(sorter, agent("sorter", "maxSteps: 50\n"));
    // The person saves writer with an alias no file has, right after Try it first reads it.
    const broken = agent("writer").replace("model: fast", "model: large");
    const readFile = store.read.bind(store);
    let writerReads = 0;
    store.read = async (path) => {
      const text = await readFile(path);
      if (path === writer && ++writerReads === 1) {
        store.files.set(writer, broken);
      }
      return text;
    };
    const { cantTry, source } = await review.tryItSource({ item: triage });
    expect(cantTry).toEqual([]);
    expect(writerReads).toBe(1);
    // After the build, the source reads the file as it is now.
    expect(await source.read(writer)).toBe(broken);
  });

  it("tries every step when an alias the run doesn't use needs a left-out provider", async () => {
    const { store, review, propose } = acme();
    await propose("providers/cloud.yaml", "id: cloud\nname: Cloud\ntype: mock\nlocal: true\n");
    await store.write("models.yaml", `${fast}  spare:\n    provider: cloud\n    model: echo\n`);
    const { cantTry, leftOut } = await review.tryItSource({ item: triage });
    expect(cantTry).toEqual([]);
    expect(leftOut.files.map((file) => file.path)).toEqual(["providers/cloud.yaml"]);
  });

  it("can't try the item when an alias it falls back to needs a left-out provider", async () => {
    const { store, review, propose } = acme();
    await propose("providers/cloud.yaml", "id: cloud\nname: Cloud\ntype: mock\nlocal: true\n");
    const models = `${fast}    fallback: [spare]\n  spare:\n    provider: cloud\n    model: echo\n`;
    await store.write("models.yaml", models);
    expect((await review.tryItSource({ item: triage })).cantTry).toEqual([
      {
        status: "cant-try",
        item: triage,
        step: null,
        reason: {
          kind: "needs-left-out-change",
          path: "providers/cloud.yaml",
          leftOut: "models",
        },
      },
    ]);
  });

  it("maps only codes the workspace checks give as errors", async () => {
    expect(Object.keys(breaksFor).sort()).toEqual(Object.keys(missingKinds).sort());
    for (const [code, files] of Object.entries(breaksFor)) {
      const broken = await loadWorkspace(new TestDefinitionStore({ ...acmeFiles, ...files }));
      const errors = broken.issues.filter((issue) => issue.severity === "error");
      expect(
        errors.map((issue) => issue.code),
        code,
      ).toContain(code);
    }
  });
});
