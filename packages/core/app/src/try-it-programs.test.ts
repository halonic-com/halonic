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

const triage = "hubs/support/workflows/triage.workflow.yaml";
const sorter = "hubs/support/agents/sorter.agent.yaml";
const writer = "hubs/support/agents/writer.agent.yaml";
const sync = "library/connectors/sync.connector.yaml";
const script = "tools/run.sh";

function agent(id: string, more = ""): string {
  return `id: ${id}\nname: ${id}\ninstructions: Help.\nmodel: fast\n${more}`;
}

const stdioSync = "transport:\n  stdio:\n    command: sh\n    args: [run.sh]\n    cwd: tools\n";

/** Workflow `triage`: step `sort` runs `sorter`, then step `reply` runs `writer`. */
const workflow = [
  "id: triage",
  "name: Triage",
  "initial: sort",
  "states:",
  "  sort:",
  "    agent: sorter",
  "    on:",
  "      - to: reply",
  "  reply:",
  "    agent: writer",
  "    on:",
  "      - to: done",
  "  done:",
  "    type: final",
  "",
].join("\n");

/** Acme's support hub, where `writer` uses connector `sync`, which runs `tools/run.sh`. */
function acme(files: Readonly<Record<string, string>> = {}) {
  const store = new TestDefinitionStore(
    {
      "workspace.yaml": "id: acme\nname: Acme\n",
      "providers/mock.yaml": "id: mock\nname: Mock\ntype: mock\nlocal: true\n",
      "models.yaml": "aliases:\n  fast:\n    provider: mock\n    model: echo\n",
      "hubs/support/hub.yaml": "id: support\nname: Support\n",
      [triage]: workflow,
      [sorter]: agent("sorter"),
      [writer]: agent("writer", "connectors: [sync]\n"),
      [sync]: stdioSync,
      [script]: "echo accepted\n",
      ...files,
    },
    digest,
  );
  const review = new ReviewService({
    store,
    records: new TestDefinitionStore({}, digest),
    digest,
    isTrusted: () => true,
  });
  /** Writes `content` as the assistant, over what the file holds now. */
  const propose = async (path: string, content: string) => {
    const current = store.files.get(path);
    const expected = current === undefined ? "absent" : await contentDigest(current, digest);
    const card = { chatId: "c1", cardId: "k1" };
    expect((await review.propose({ path, content, expected, card })).status).toBe("written");
  };
  return { store, review, propose };
}

const scriptHeldBack = {
  kind: "needs-left-out-change",
  path: script,
  leftOut: "trust-and-sandbox",
} as const;

verifies("app.try-it-programs-see-try-it-source", () => {
  it("can't try the step whose unpinned stdio connector would run a held-back script", async () => {
    const { review, propose } = acme();
    await propose(script, "echo changed\n");

    const { cantTry, source } = await review.tryItSource({ item: triage });

    expect(cantTry).toEqual([
      { status: "cant-try", item: triage, step: "reply", reason: scriptHeldBack },
    ]);
    // Try it's own source holds the script back; only a program reading the disk would see the change.
    expect(await source.read(script)).toBe("echo accepted\n");
  });

  it("tries the step when the connector is pinned, as it runs in its own folder", async () => {
    const { review, propose } = acme();
    await propose(script, "echo changed\n");

    const { cantTry } = await review.tryItSource({ item: triage, pinned: new Set(["sync"]) });

    expect(cantTry).toEqual([]);
  });

  it("can't try a step whose agent runs in a harness, nor that agent tried alone", async () => {
    const { review, propose } = acme({ [sorter]: agent("sorter", "harness: claude-code\n") });
    await propose(".tools/run.sh", "echo changed\n");
    const reason = { ...scriptHeldBack, path: ".tools/run.sh" };

    expect((await review.tryItSource({ item: triage })).cantTry).toEqual([
      { status: "cant-try", item: triage, step: "sort", reason },
      { status: "cant-try", item: triage, step: "reply", reason },
    ]);
    expect((await review.tryItSource({ item: sorter })).cantTry).toEqual([
      { status: "cant-try", item: sorter, step: null, reason },
    ]);
  });

  it("tries an agent in Halonic's own loop, which starts no program", async () => {
    const { review, propose } = acme({ [writer]: agent("writer", "harness: halonic\n") });
    await propose(script, "echo changed\n");

    expect((await review.tryItSource({ item: triage })).cantTry).toEqual([]);
  });

  it("runs connectors and harness agents as before when no file that isn't an item is held back", async () => {
    const { review, propose } = acme({ [sorter]: agent("sorter", "harness: codex\n") });
    await propose(writer, agent("writer", "connectors: [sync]\n").replace("Help.", "Be brief."));

    expect((await review.tryItSource({ item: triage })).cantTry).toEqual([]);
  });
});
