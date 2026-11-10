import type { Digest } from "@halonicjs/ports";
import { contentDigest } from "@halonicjs/std";
import { expect, it } from "vitest";
import { ReviewFiles } from "./review-files.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const clerk = "agents/clerk.agent.yaml";
const k1 = { chatId: "c1", cardId: "k1" };

function setUp() {
  return new ReviewFiles({
    store: new TestDefinitionStore({}, digest),
    records: new TestDefinitionStore({}, digest),
    digest,
  });
}

it("keeps a record saved while every record is being listed", async () => {
  const files = setUp();
  expect(await files.hasRecord(clerk)).toBe(false);
  const record = {
    path: clerk,
    baseline: null,
    card: k1,
    seen: await contentDigest("a\n", digest),
  };
  const listing = files.list();
  const saving = files.putRecord(clerk, record);
  await Promise.all([listing, saving]);
  expect(await files.hasRecord(clerk)).toBe(true);
});

it("forgets a record removed while every record is being listed", async () => {
  const files = setUp();
  const record = {
    path: clerk,
    baseline: null,
    card: k1,
    seen: await contentDigest("a\n", digest),
  };
  await files.putRecord(clerk, record);
  expect(await files.hasRecord(clerk)).toBe(true);
  await Promise.all([files.list(), files.putRecord(clerk, null)]);
  expect(await files.hasRecord(clerk)).toBe(false);
});
