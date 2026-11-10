// What the assistant may never write, and may write only while trusted
// (HAL-65 section F, rules A to C). The attack tests of HAL-3353; Julian
// adds the cases that need a real folder or a run's proposal.

import type { Digest } from "@halonicjs/ports";
import { contentDigest } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { ReviewRecords } from "./review-records.ts";
import { ReviewService } from "./review-service.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const clerk = "agents/clerk.agent.yaml";
const fast = "name: Clerk\nmodel: fast\n";
const smart = "name: Clerk\nmodel: smart\n";
const k1 = { chatId: "c1", cardId: "k1" };

const digestOf = (text: string) => contentDigest(text, digest);

/** A workspace whose trust the test can change between two writes. */
function setUp(options: { trusted: boolean; store?: TestDefinitionStore }) {
  const store = options.store ?? new TestDefinitionStore({ [clerk]: fast }, digest);
  const recordStore = new TestDefinitionStore({}, digest);
  const trust = { trusted: options.trusted };
  const review = new ReviewService({
    store,
    records: recordStore,
    digest,
    isTrusted: () => trust.trusted,
  });
  return { store, recordStore, trust, review, records: new ReviewRecords(recordStore, digest) };
}

/** Writes a new file the way `propose_file` does. */
function proposeNew(review: ReviewService, path: string) {
  return review.propose({ path, content: "planted\n", expected: "absent", card: k1 });
}

verifies("app.assistant-no-git-or-halonic", () => {
  // A4, with the spellings that fold to `.halonic` on a case-insensitive disk (HAL-3947).
  const halonicPaths = [
    ".halonic/review/files/0123abcd.json",
    ".halonic/other.json",
    "hubs/h/.halonic/x",
    ".Halonic./review/x",
    ".Halonic/review/x.json",
    ".HALONIC/x",
    ".halonic./x",
    ".halonic /x",
    "hubs/h/.Halonic/x",
    "Hubs/h/.halonic/x",
    ".halonic\u200C/x",
    "HALONI~1/x",
  ];
  const gitPaths = [
    ".git/hooks/pre-commit",
    ".GIT/hooks/x",
    ".git./hooks/x",
    "GIT~1/hooks/x",
    "a/../.git/hooks/x",
    "hubs/h/.git/config",
  ];

  for (const trusted of [true, false]) {
    describe(trusted ? "trusted" : "untrusted", () => {
      it.each([...halonicPaths, ...gitPaths])(
        "refuses %j and touches no file or record",
        async (path) => {
          const { store, recordStore, review } = setUp({ trusted });
          const outcome = await proposeNew(review, path);
          expect(outcome).toEqual({
            status: "refused",
            reason: trusted ? "not-allowed" : "untrusted",
          });
          expect(store.log).toEqual([]);
          expect([...store.files.keys()]).toEqual([clerk]);
          expect(recordStore.files.size).toBe(0);
        },
      );
    });
  }

  it.each([".envrc", ".env.local", "/etc/passwd", "a//b", "agents\\x.agent.yaml", "notes:stream"])(
    "refuses the unsafe or private path %j while trusted",
    async (path) => {
      const { store, review } = setUp({ trusted: true });
      expect(await proposeNew(review, path)).toEqual({ status: "refused", reason: "not-allowed" });
      expect(store.log).toEqual([]);
    },
  );

  it("refuses an item path with a short-name hub even while untrusted", async () => {
    const { store, review } = setUp({ trusted: false });
    const outcome = await proposeNew(review, "hubs/GIT~1/agents/a.agent.yaml");
    expect(outcome).toEqual({ status: "refused", reason: "not-allowed" });
    expect(store.log).toEqual([]);
  });

  it("turns the store's refusal of a path, such as through a symlink, into a refusal", async () => {
    const linked = "agents/link/a.agent.yaml";
    const store = new SymlinkRefusingStore(linked);
    const { recordStore, review } = setUp({ trusted: true, store });
    expect(await proposeNew(review, linked)).toEqual({ status: "refused", reason: "not-allowed" });
    expect(store.files.has(linked)).toBe(false);
    expect(recordStore.files.size).toBe(0);
  });
});

verifies("app.assistant-untrusted-items-only", () => {
  // B1, and the paths of B2 that need no delete: the reason only, the tool holds the words.
  it.each([
    ".envrc",
    "package.json",
    ".vscode/tasks.json",
    ".github/workflows/x.yml",
    ".npmrc",
    "README.md",
  ])("refuses %j while untrusted and writes nothing", async (path) => {
    const { store, recordStore, review } = setUp({ trusted: false });
    expect(await proposeNew(review, path)).toEqual({ status: "refused", reason: "untrusted" });
    expect(store.log).toEqual([]);
    expect(recordStore.files.size).toBe(0);
  });

  // B3: the control case.
  it("writes an agent file and models.yaml while untrusted, marking their records", async () => {
    const { store, review, records } = setUp({ trusted: false });
    const agent = await review.propose({
      path: clerk,
      content: smart,
      expected: await digestOf(fast),
      card: k1,
    });
    const models = await proposeNew(review, "models.yaml");
    expect(agent.status).toBe("written");
    expect(models.status).toBe("written");
    expect(store.files.get(clerk)).toBe(smart);
    expect(await records.read(clerk)).toEqual({
      status: "found",
      record: {
        path: clerk,
        baseline: fast,
        card: k1,
        seen: await digestOf(smart),
        writtenUntrusted: true,
      },
    });
    const read = await records.read("models.yaml");
    expect(read.status === "found" && read.record.writtenUntrusted).toBe(true);
  });

  it("writes any safe file while trusted, without the mark", async () => {
    const { store, review, records } = setUp({ trusted: true });
    expect((await proposeNew(review, "package.json")).status).toBe("written");
    expect(store.files.get("package.json")).toBe("planted\n");
    const read = await records.read("package.json");
    expect(read.status === "found" && read.record.writtenUntrusted).toBeUndefined();
  });

  // B4.
  it("asks for trust on every write", async () => {
    const { store, trust, review } = setUp({ trusted: true });
    expect((await proposeNew(review, "package.json")).status).toBe("written");
    trust.trusted = false;
    expect(await proposeNew(review, ".npmrc")).toEqual({ status: "refused", reason: "untrusted" });
    expect(store.files.has(".npmrc")).toBe(false);
  });

  it("reads trust when a queued write runs, not when it is queued", async () => {
    const store = new HoldingStore("package.json");
    const { trust, review } = setUp({ trusted: true, store });
    const first = proposeNew(review, "package.json");
    await store.reached;
    const second = review.propose({
      path: "package.json",
      content: "second\n",
      expected: await digestOf("planted\n"),
      card: k1,
    });
    trust.trusted = false;
    store.release();
    expect((await first).status).toBe("written");
    expect(await second).toEqual({ status: "refused", reason: "untrusted" });
    expect(store.files.get("package.json")).toBe("planted\n");
    expect(store.log).toEqual(["write package.json"]);
  });

  it("keeps the mark when the file is written again while trusted", async () => {
    const { trust, review, records } = setUp({ trusted: false });
    await review.propose({ path: clerk, content: smart, expected: await digestOf(fast), card: k1 });
    trust.trusted = true;
    const again = `${smart}temperature: 0.2\n`;
    await review.propose({
      path: clerk,
      content: again,
      expected: await digestOf(smart),
      card: { chatId: "c2", cardId: "k7" },
    });
    const read = await records.read(clerk);
    expect(read.status === "found" && read.record.writtenUntrusted).toBe(true);
  });

  it("drops the mark with the record once the file is its baseline again", async () => {
    const { trust, review, records } = setUp({ trusted: false });
    await review.propose({ path: clerk, content: smart, expected: await digestOf(fast), card: k1 });
    trust.trusted = true;
    await review.propose({ path: clerk, content: fast, expected: await digestOf(smart), card: k1 });
    expect(await records.read(clerk)).toEqual({ status: "none" });
    await review.propose({ path: clerk, content: smart, expected: await digestOf(fast), card: k1 });
    const read = await records.read(clerk);
    expect(read.status === "found" && read.record.writtenUntrusted).toBeUndefined();
  });
});

/**
 * A store that holds the first write of one path until the test releases
 * it, so a second write to that path waits in the file's turn behind it.
 */
class HoldingStore extends TestDefinitionStore {
  private readonly held: string;
  private readonly arrived = Promise.withResolvers<void>();
  private readonly gate = Promise.withResolvers<void>();

  constructor(held: string) {
    super({ [clerk]: fast }, digest);
    this.held = held;
  }

  /** Settles once the held write has started. */
  get reached(): Promise<void> {
    return this.arrived.promise;
  }

  release(): void {
    this.gate.resolve();
  }

  override async write(
    ...args: Parameters<TestDefinitionStore["write"]>
  ): ReturnType<TestDefinitionStore["write"]> {
    if (args[0] === this.held) {
      this.arrived.resolve();
      await this.gate.promise;
    }
    return super.write(...args);
  }
}

/**
 * A store that refuses one path the way a folder store refuses a path
 * through a symlink: with a `RangeError`, before touching anything.
 */
class SymlinkRefusingStore extends TestDefinitionStore {
  private readonly linked: string;

  constructor(linked: string) {
    super({ [clerk]: fast }, digest);
    this.linked = linked;
  }

  override async read(path: string): Promise<string | null> {
    this.refuseLinked(path);
    return super.read(path);
  }

  override async write(
    ...args: Parameters<TestDefinitionStore["write"]>
  ): ReturnType<TestDefinitionStore["write"]> {
    this.refuseLinked(args[0]);
    return super.write(...args);
  }

  private refuseLinked(path: string): void {
    if (path === this.linked) {
      throw new RangeError(
        `Unsafe workspace path ${JSON.stringify(path)}: it goes through a link.`,
      );
    }
  }
}
