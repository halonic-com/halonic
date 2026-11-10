import type { Digest } from "@halonicjs/ports";
import { contentDigest } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { ReviewRecords } from "./review-records.ts";
import { ReviewService } from "./review-service.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";
import { TestTrash } from "./testing/test-trash.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const agent = "hubs/p/agents/clerk.agent.yaml";
const k1 = { chatId: "c1", cardId: "k1" };

/** A workspace whose trust the test switches, with `package.json` and an agent in it. */
function setUp() {
  const store = new TestDefinitionStore(
    { "package.json": "{}\n", [agent]: "name: Clerk\n" },
    digest,
  );
  const recordStore = new TestDefinitionStore({}, digest);
  const trust = { trusted: true };
  const review = new ReviewService({
    store,
    records: recordStore,
    digest,
    trash: new TestTrash(store, digest),
    isTrusted: () => trust.trusted,
  });
  return { store, trust, review, records: new ReviewRecords(recordStore, digest) };
}

verifies("app.review-assistant-limits", () => {
  it("refuses .git, every .halonic folder, private and unsafe paths, trusted or not", async () => {
    const { store, trust, review } = setUp();
    const before = new Map(store.files);
    for (const trusted of [true, false]) {
      trust.trusted = trusted;
      for (const path of [
        ".git/hooks/pre-commit",
        ".GIT./hooks/x",
        ".halonic/review/files/x.json",
        ".halonic/other.json",
        "hubs/h/.halonic/x",
        ".Halonic./review/x",
        ".envrc",
        "a/../.git/hooks/x",
      ]) {
        const write = await review.propose({ path, content: "x", expected: "absent", card: k1 });
        expect(write, path).toEqual({ status: "refused", reason: "not-allowed" });
        const remove = await review.proposeDelete({ path, expected: "absent", card: k1 });
        expect(remove, path).toEqual({ status: "refused", reason: "not-allowed" });
      }
    }
    expect(store.files).toEqual(before);
  });

  it("refuses everything but Halonic item files while untrusted, reading trust on every call", async () => {
    const { store, trust, review } = setUp();
    const expected = await contentDigest("{}\n", digest);
    expect(
      (await review.propose({ path: "package.json", content: "[]\n", expected, card: k1 })).status,
    ).toBe("written");
    trust.trusted = false;
    const refused = { status: "refused", reason: "untrusted" };
    const afterFirst = await contentDigest("[]\n", digest);
    expect(
      await review.propose({
        path: "package.json",
        content: "{}\n",
        expected: afterFirst,
        card: k1,
      }),
    ).toEqual(refused);
    expect(
      await review.proposeDelete({ path: "package.json", expected: afterFirst, card: k1 }),
    ).toEqual(refused);
    expect(
      await review.propose({
        path: ".vscode/tasks.json",
        content: "{}",
        expected: "absent",
        card: k1,
      }),
    ).toEqual(refused);
    expect(store.files.get("package.json")).toBe("[]\n");
  });

  it("lets an untrusted workspace change item files, and marks those changes until they're decided", async () => {
    const { trust, review, records } = setUp();
    trust.trusted = false;
    const expected = await contentDigest("name: Clerk\n", digest);
    await review.propose({ path: agent, content: "name: Clerk 2\n", expected, card: k1 });
    await review.propose({
      path: "models.yaml",
      content: "aliases: {}\n",
      expected: "absent",
      card: k1,
    });
    trust.trusted = true;
    await review.propose({
      path: agent,
      content: "name: Clerk 3\n",
      expected: await contentDigest("name: Clerk 2\n", digest),
      card: k1,
    });
    const read = await records.read(agent);
    expect(read.status === "found" && read.record.writtenUntrusted).toBe(true);
    const models = await records.read("models.yaml");
    expect(models.status === "found" && models.record.writtenUntrusted).toBe(true);
  });

  it("leaves the mark off a change made while trusted", async () => {
    const { review, records } = setUp();
    const expected = await contentDigest("name: Clerk\n", digest);
    await review.propose({ path: agent, content: "name: Clerk 2\n", expected, card: k1 });
    const read = await records.read(agent);
    expect(read.status === "found" && read.record.writtenUntrusted).toBeUndefined();
  });
});
