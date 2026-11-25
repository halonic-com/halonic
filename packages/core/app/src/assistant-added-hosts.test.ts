// HAL-18397's Done when: the hosts an accepted assistant change adds to a
// local integration's sheet, that the person didn't name, are recorded in
// the review folder in the profile, and only there. The trust screen and the
// CLI mark them "added by the assistant" while the sheet has them.

import type { Digest } from "@halonicjs/ports";
import { contentDigest } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { assistantAddedIn, assistantHostsFile } from "./assistant-hosts.ts";
import { ReviewService } from "./review-service.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";

const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const folder = "integrations/notes";
const path = `${folder}/integration.yaml`;
const card = { chatId: "c1", cardId: "k1" };

/** The notes integration's sheet with `hosts`. */
function sheet(...hosts: string[]): string {
  return `id: notes
version: 0.1.0
kit: 1
provides: [connector]
hosts: [${hosts.join(", ")}]
tools:
  - { name: reading, description: The last note., risk: read, untrusted: true }
`;
}

/** A workspace, its review folder in the profile and its review service. */
function setUp(files: Record<string, string> = {}) {
  const store = new TestDefinitionStore(files, digest);
  const records = new TestDefinitionStore({}, digest);
  const review = new ReviewService({ store, records, digest, isTrusted: () => true });
  return { store, records, review };
}

/** The assistant writes `content` over what the file holds now, for card k1 of chat c1. */
async function propose(setup: ReturnType<typeof setUp>, content: string): Promise<void> {
  const current = await setup.store.read(path);
  const expected = current === null ? "absent" : await contentDigest(current, digest);
  const outcome = await setup.review.propose({ path, content, expected, card });
  expect(outcome.status).toBe("written");
}

/** The marked hosts of the notes integration, as the trust screen shows them for `hosts`. */
async function marked(review: ReviewService, ...hosts: string[]): Promise<string[]> {
  return [...assistantAddedIn(await review.assistantAddedHosts(), folder, hosts)];
}

verifies("app.review-assistant-added-hosts", () => {
  it("1. marks the host an accepted change adds that the person didn't name, not the sheet's own", async () => {
    const setup = setUp({ [path]: sheet("notes.example.com") });
    await propose(setup, sheet("notes.example.com", "api.example.com"));

    await setup.review.accept({ kind: "card", card });

    expect(await marked(setup.review, "notes.example.com", "api.example.com")).toEqual([
      "api.example.com",
    ]);
  });

  it("2. records nothing when the person rejects the change", async () => {
    const setup = setUp({ [path]: sheet("notes.example.com") });
    await propose(setup, sheet("notes.example.com", "api.example.com"));

    await setup.review.reject({ kind: "card", card });

    expect(await marked(setup.review, "notes.example.com", "api.example.com")).toEqual([]);
    expect(setup.records.files.has(assistantHostsFile)).toBe(false);
  });

  it("3. drops the mark once the host leaves the sheet", async () => {
    const setup = setUp({ [path]: sheet("notes.example.com") });
    await propose(setup, sheet("notes.example.com", "api.example.com"));
    await setup.review.accept({ kind: "card", card });

    // The person takes the host out by hand: the sheet no longer has it, so nothing shows.
    setup.store.files.set(path, sheet("notes.example.com"));
    expect(await marked(setup.review, "notes.example.com")).toEqual([]);

    // The next accepted change to the sheet drops it from the record too.
    await propose(setup, sheet("notes.example.com", "cdn.example.com"));
    await setup.review.accept({ kind: "card", card });
    const marks = await setup.review.assistantAddedHosts();
    expect([...(marks.get(folder) ?? [])]).toEqual(["cdn.example.com"]);
  });

  it("4. reads the marks only from the review folder in the profile, never from the workspace", async () => {
    const forged = JSON.stringify({ format: 1, integrations: { [folder]: ["api.example.com"] } });
    const setup = setUp({
      [path]: sheet("notes.example.com", "api.example.com"),
      [assistantHostsFile]: forged,
      [`${folder}/${assistantHostsFile}`]: forged,
    });

    expect(await marked(setup.review, "notes.example.com", "api.example.com")).toEqual([]);
  });

  it("5. doesn't mark a host the person named in the chat, even on a new sheet", async () => {
    const setup = setUp();
    setup.review.readHostsNamedWith(
      async (chatId) => (host) => chatId === "c1" && host === "api.example.com",
    );
    await propose(setup, sheet("api.example.com", "cdn.example.com"));

    await setup.review.accept({ kind: "card", card });

    expect(await marked(setup.review, "api.example.com", "cdn.example.com")).toEqual([
      "cdn.example.com",
    ]);
  });

  it("marks every added host when the person's messages can't be read", async () => {
    const setup = setUp();
    setup.review.readHostsNamedWith(async () => {
      throw new Error("the chat is gone");
    });
    await propose(setup, sheet("api.example.com"));

    await setup.review.accept({ kind: "file", path });

    expect(await marked(setup.review, "api.example.com")).toEqual(["api.example.com"]);
  });

  it("marks nothing for a file that isn't a local integration's sheet", async () => {
    const setup = setUp();
    const other = "integrations/notes/nested/integration.yaml";
    const outcome = await setup.review.propose({
      path: other,
      content: sheet("api.example.com"),
      expected: "absent",
      card,
    });
    expect(outcome.status).toBe("written");

    await setup.review.accept({ kind: "card", card });

    expect(setup.records.files.has(assistantHostsFile)).toBe(false);
  });
});
