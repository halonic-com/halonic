import type { Digest } from "@halonicjs/ports";
import { contentDigest } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { ReviewService } from "./review-service.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";

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

/** Acme's support hub with workflow `triage`, a billing hub, and the trust the test sets. */
function acme() {
  const store = new TestDefinitionStore(
    {
      "workspace.yaml": "id: acme\nname: Acme\n",
      "providers/mock.yaml": "id: mock\nname: Mock\ntype: mock\nlocal: true\n",
      "models.yaml": fast,
      "hubs/support/hub.yaml": "id: support\nname: Support\n",
      "hubs/billing/hub.yaml": "id: billing\nname: Billing\n",
      [triage]: workflow(),
      [sorter]: agent("sorter"),
      [writer]: agent("writer"),
      [billingAgent]: agent("clerk"),
    },
    digest,
  );
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

  it("counts only what the item's run reads", async () => {
    const { review, propose } = acme();
    await propose(billingAgent, agent("clerk", "maxSteps: 50\n"));
    expect((await review.tryItSource({ item: triage })).leftOut.total).toBe(0);
    expect((await review.tryItSource({ item: billingAgent })).leftOut.files).toEqual([
      { path: billingAgent, reason: "permissions", changes: 1 },
    ]);
    expect((await review.tryItSource()).leftOut.total).toBe(1);
  });
});
