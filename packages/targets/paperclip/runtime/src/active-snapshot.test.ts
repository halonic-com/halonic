import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { activeSnapshot, retryAfterMs } from "./active-snapshot.ts";
import { builtInSnapshot, emptySnapshot } from "./built-in.ts";
import {
  acmeSnapshot,
  acmeTool,
  builtIn,
  fakeHost,
  pinnedCommit,
  publishedSnapshot,
} from "./fake-host.test-helper.ts";
import { gitHubReader } from "./github.ts";
import { readPin } from "./pin.ts";

const start = new Date("2026-11-24T12:00:00Z");
/** A key-shaped value, built at run time so the file itself holds none. */
const fakeGitHubToken = `ghp_${"Q7x2Lm9K".repeat(4)}abcd`;

/** A runtime over a fake host, and a function that asks it for the active snapshot at a time. */
function runtime(config: Record<string, unknown>, answers: Record<string, unknown>) {
  const host = fakeHost(config, answers);
  const github = async () => gitHubReader({ fetch: host.ctx.http.fetch, token: "test-token" });
  const active = (now = start) =>
    activeSnapshot(host.ctx, { companyId: "acme", config, builtIn, github, now });
  return { ...host, active };
}

verifies("runtime.snapshot-fallback", () => {
  describe("which snapshot it serves", () => {
    test("without a pin, the built-in snapshot and no request", async () => {
      const { active, sent } = runtime({}, {});
      expect(await active()).toEqual({ snapshot: builtIn, source: "built-in" });
      expect(sent).toEqual([]);
    });

    test("a pin with a green check and the right checksum, loaded once and kept", async () => {
      const published = await publishedSnapshot(acmeSnapshot());
      const { active, sent } = runtime(published.pin, published.answers);
      expect(await active()).toEqual({ snapshot: acmeSnapshot(), source: "pinned" });
      expect(sent).toHaveLength(2);
      expect(await active()).toEqual({ snapshot: acmeSnapshot(), source: "pinned" });
      expect(sent).toHaveLength(2);
    });

    test("a red check: the built-in snapshot, a stale metric, and no new try for 10 minutes", async () => {
      const published = await publishedSnapshot(acmeSnapshot(), "failure");
      const { active, sent, metrics } = runtime(published.pin, published.answers);
      expect(await active()).toEqual({
        snapshot: builtIn,
        source: "built-in",
        staleReason: `The workspace check ci-ok on ${pinnedCommit} is failure, not green.`,
      });
      expect(metrics).toEqual([
        { name: "workspace.snapshot_stale_minutes", value: 0, tags: { companyId: "acme" } },
      ]);
      const tries = sent.length;
      await active(new Date(start.getTime() + retryAfterMs - 1));
      expect(sent).toHaveLength(tries);
      await active(new Date(start.getTime() + retryAfterMs));
      expect(sent).toHaveLength(tries + 1);
      expect(metrics.at(-1)).toEqual({
        name: "workspace.snapshot_stale_minutes",
        value: 10,
        tags: { companyId: "acme" },
      });
    });

    test("a wrong checksum, another commit or a key in the snapshot is refused whole", async () => {
      const wrongSum = await publishedSnapshot(acmeSnapshot());
      const first = runtime({ ...wrongSum.pin, snapshotSha256: "f".repeat(64) }, wrongSum.answers);
      expect((await first.active()).staleReason).toBe(
        `The snapshot's sha-256 is ${wrongSum.sha256}, not the pinned ${"f".repeat(64)}.`,
      );
      const other = await publishedSnapshot(
        acmeSnapshot({ workspace: { name: "acme", commit: "2".repeat(40) } }),
      );
      const second = runtime(other.pin, other.answers);
      expect((await second.active()).staleReason).toBe(
        `The snapshot was built from ${"2".repeat(40)}, not the pinned ${pinnedCommit}.`,
      );
      const keyed = await publishedSnapshot(
        acmeSnapshot({ tools: [acmeTool("pr_status", { description: fakeGitHubToken })] }),
      );
      const third = runtime(keyed.pin, keyed.answers);
      const served = await third.active();
      expect(served.source).toBe("built-in");
      expect(served.staleReason).toMatch(/^The snapshot is refused: tools\.0\.description/);
      expect(served.staleReason).not.toContain(fakeGitHubToken);
    });

    test("with GitHub down after a new pin, the last good snapshot unchanged", async () => {
      const published = await publishedSnapshot(acmeSnapshot());
      const config: Record<string, unknown> = { ...published.pin };
      const { active, github } = runtime(config, published.answers);
      await active();
      github.down = true;
      config["snapshotCommit"] = "3".repeat(40);
      const served = await active();
      expect(served.snapshot).toEqual(acmeSnapshot());
      expect(served.source).toBe("last-good");
      expect(served.staleReason).toMatch(/ECONNREFUSED/);
    });

    test("a half-set pin serves the built-in snapshot and says why", async () => {
      const { active, sent } = runtime({ workspaceRepo: "acme/workspace-acme" }, {});
      expect((await active()).staleReason).toBe(
        "The pin is invalid: the pinned commit must be a full commit id in lowercase hex.",
      );
      expect(sent).toEqual([]);
      expect(
        readPin({
          workspaceRepo: "acme/..",
          snapshotCommit: pinnedCommit,
          snapshotSha256: "b".repeat(64),
        }),
      ).toBe("the workspace repository must be owner/name.");
    });
  });

  describe("the built-in snapshot", () => {
    test("missing or refused, it is empty and says why", async () => {
      const missing = await builtInSnapshot(async () => {
        throw new Error("Cannot find module './snapshot.json'");
      });
      expect(missing).toEqual({
        snapshot: emptySnapshot,
        problem: "no built-in snapshot: Cannot find module './snapshot.json'",
      });
      const refused = await builtInSnapshot(async () => ({ format: 2 }));
      expect(refused.snapshot).toEqual(emptySnapshot);
      expect(refused.problem).toMatch(/^The snapshot is refused/);
      expect(await builtInSnapshot(async () => acmeSnapshot())).toEqual({
        snapshot: acmeSnapshot(),
      });
    });
  });
});
