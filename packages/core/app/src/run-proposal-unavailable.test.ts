import type { Digest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { ProposalUnavailableError } from "./run-proposal-types.ts";
import { clerk, proposeRun, setUpProposals } from "./testing/run-proposal-fixtures.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const clerkPath = "agents/clerk.agent.yaml";
const ref = "refs/halonic/proposals/01JD8Q";

/** Run `01JD8Q`: changes the model of `clerk` and adds `notes/today.md`. */
async function setUpRun() {
  const setup = setUpProposals(digest);
  await proposeRun(setup, "01JD8Q", (files) => {
    files.set(clerkPath, "name: Clerk\nmodel: smart\n");
    files.set("notes/today.md", "Three tickets.\n");
  });
  return setup;
}

verifies("app.run-proposal-unavailable", () => {
  describe("a proposal whose ref was deleted outside Halonic", () => {
    it("is reported as unavailable, and Accept writes nothing", async () => {
      const setup = await setUpRun();
      expect(await setup.proposals.isUnavailable("01JD8Q")).toBe(false);
      setup.vcs.refs.delete(ref);
      expect(await setup.proposals.isUnavailable("01JD8Q")).toBe(true);
      await expect(setup.proposals.accept("01JD8Q", "all")).rejects.toBeInstanceOf(
        ProposalUnavailableError,
      );
      await expect(setup.proposals.compare("01JD8Q", clerkPath)).rejects.toBeInstanceOf(
        ProposalUnavailableError,
      );
      expect(setup.store.files.get(clerkPath)).toBe(clerk);
      expect(setup.store.files.has("notes/today.md")).toBe(false);
    });

    it("is removed as unavailable, its undecided files not reviewed", async () => {
      const setup = await setUpRun();
      await setup.proposals.reject("01JD8Q", { file: "notes/today.md" });
      setup.vcs.refs.delete(ref);
      await setup.proposals.removeUnavailable("01JD8Q");
      const record = await setup.proposals.get("01JD8Q");
      expect(record?.decisions).toEqual({ [clerkPath]: "undecided", "notes/today.md": "rejected" });
      expect(record?.settled).toEqual({ at: "2026-11-11T09:00:00.000Z", why: "unavailable" });
      expect(await setup.proposals.isUnavailable("01JD8Q")).toBe(false);
      await expect(setup.proposals.reject("01JD8Q", "all")).rejects.toThrow(/settled/u);
    });
  });

  it("refuses to remove a proposal that still has its ref", async () => {
    const setup = await setUpRun();
    await expect(setup.proposals.removeUnavailable("01JD8Q")).rejects.toThrow(/still available/u);
    expect((await setup.proposals.get("01JD8Q"))?.settled).toBeUndefined();
    expect(setup.vcs.refs.has(ref)).toBe(true);
  });

  it("never reports a settled proposal as unavailable", async () => {
    const setup = await setUpRun();
    await setup.proposals.reject("01JD8Q", "all");
    await setup.proposals.settle("01JD8Q");
    expect(setup.vcs.refs.has(ref)).toBe(false);
    expect(await setup.proposals.isUnavailable("01JD8Q")).toBe(false);
  });
});
