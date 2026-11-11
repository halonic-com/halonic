import { formatLogLines } from "@halonicjs/ports";
import { errorKindOf, KindedError } from "@halonicjs/std";
import { entered, runStoreContract, started } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { FakeRunShell } from "./fake-run-shell.test-helper.ts";
import { isRunRefusal, type RunRefusalKind } from "./run-commands.ts";
import { TauriRunStore } from "./run-store.ts";
import type { TauriShell } from "./shell.ts";

const acme = "/workspaces/acme";

// The contract runs against the fake shell. That the shell and the CLI take
// turns on one lock is proved on real files by the Rust tests of
// crates/run-store (the shared cases) and crates/run-lock.
runStoreContract(
  "tauri",
  async () => new TauriRunStore(new FakeRunShell({ opened: [acme] }), acme),
);

/** The error a call rejects with. */
async function rejection(action: Promise<unknown>): Promise<unknown> {
  return action.then(
    () => expect.unreachable("the call should have failed"),
    (reason: unknown) => reason,
  );
}

/** A store whose shell answers every call with `answer`. */
function answering(answer: unknown): TauriRunStore {
  const shell: TauriShell = { invoke: async () => answer };
  return new TauriRunStore(shell, acme);
}

verifies("fs-tauri.run-store", () => {
  describe("TauriRunStore", () => {
    it("names the workspace and deployment in every call, and sends events as log lines", async () => {
      const shell = new FakeRunShell({ opened: [acme] });
      const store = new TauriRunStore(shell, acme, { deployment: "nightly" });
      const events = [started("r1"), entered("r1", 2)];
      await store.append("r1", 0, events, { snapshot: { step: 2 } });
      await store.events("r1");
      await store.snapshot("r1");
      await store.list();
      const folder = { workspace: acme, deployment: "nightly" };
      expect(shell.calls).toEqual([
        {
          command: "run_append",
          args: {
            ...folder,
            runId: "r1",
            expectedSeq: 0,
            lines: formatLogLines(events),
            snapshot: JSON.stringify({ seq: 2, state: { step: 2 } }),
          },
        },
        { command: "run_events", args: { ...folder, runId: "r1" } },
        { command: "run_snapshot", args: { ...folder, runId: "r1" } },
        { command: "run_logs", args: { ...folder, known: {} } },
      ]);
    });

    it("keeps a deployment's runs apart from the workspace's own", async () => {
      const shell = new FakeRunShell({ opened: [acme] });
      const own = new TauriRunStore(shell, acme);
      await new TauriRunStore(shell, acme, { deployment: "nightly" }).append("r1", 0, [
        started("r1"),
      ]);
      expect(await own.events("r1")).toEqual([]);
      expect(shell.calls.at(-1)?.args).toEqual({ workspace: acme, deployment: null, runId: "r1" });
    });

    it("refuses a workspace the person didn't open in the shell as denied", async () => {
      const store = new TauriRunStore(new FakeRunShell({ opened: [acme] }), "/workspaces/other");
      const error = await rejection(store.append("r1", 0, [started("r1")]));
      expect(errorKindOf(error)).toBe("denied");
      expect(String(error)).toContain("/workspaces/other is not an opened folder");
    });

    it("refuses an unsafe deployment id when it is made, since it becomes a folder name", () => {
      const shell = new FakeRunShell({ opened: [acme] });
      for (const deployment of ["../nightly", "Nightly", "", "con", "a".repeat(65)]) {
        expect(() => new TauriRunStore(shell, acme, { deployment }), deployment).toThrow(
          RangeError,
        );
      }
      expect(shell.calls).toEqual([]);
    });

    it("refuses an unsafe run id before asking the shell", async () => {
      const shell = new FakeRunShell({ opened: [acme] });
      const store = new TauriRunStore(shell, acme);
      await expect(store.append("../r1", 0, [started("../r1")])).rejects.toThrow(RangeError);
      await expect(store.events("NUL.jsonl")).rejects.toThrow(RangeError);
      await expect(store.snapshot(".hidden")).rejects.toThrow(RangeError);
      expect(shell.calls).toEqual([]);
    });

    it("stores the events when the shell couldn't write the snapshot, and tells the hook", async () => {
      const shell = new FakeRunShell({ opened: [acme] });
      shell.failSnapshots();
      const onSnapshotError = vi.fn();
      const store = new TauriRunStore(shell, acme, { onSnapshotError });
      const result = await store.append("r1", 0, [started("r1")], { snapshot: { step: 1 } });
      expect(result).toEqual({ ok: true, lastSeq: 1 });
      expect(onSnapshotError).toHaveBeenCalledWith("r1", new Error("No space left on device"));
      expect(await store.snapshot("r1")).toBeNull();
      // Without a hook the failure is dropped, and the append still succeeds.
      const quiet = new TauriRunStore(shell, acme);
      const next = await quiet.append("r1", 1, [entered("r1", 2)], { snapshot: { step: 2 } });
      expect(next).toEqual({ ok: true, lastSeq: 2 });
    });

    it("drops a snapshot that isn't one, or is ahead of the log", async () => {
      const shell = new FakeRunShell({ opened: [acme] });
      const store = new TauriRunStore(shell, acme);
      const log = formatLogLines([started("r1"), entered("r1", 2)]);
      const unusable = [
        "not json",
        "null",
        '{"seq":0,"state":{}}',
        '{"seq":"1","state":{}}',
        '{"seq":1}',
        '{"seq":3,"state":{}}',
      ];
      for (const snapshot of unusable) {
        shell.plant(acme, "r1", { log, snapshot });
        expect(await store.snapshot("r1"), snapshot).toBeNull();
      }
      shell.plant(acme, "r1", { log, snapshot: '{"seq":2,"state":{"step":2}}' });
      expect(await store.snapshot("r1")).toEqual({ seq: 2, state: { step: 2 } });
    });

    it("lists only runs with events, and reads a broken log's lines as fs-node does", async () => {
      const shell = new FakeRunShell({ opened: [acme] });
      const store = new TauriRunStore(shell, acme);
      shell.plant(acme, "empty", { log: "" });
      shell.plant(acme, "r1", { log: formatLogLines([started("r1")]) });
      expect((await store.list()).map((summary) => summary.id)).toEqual(["r1"]);
      shell.plant(acme, "r2", { log: '{"not an event"\n' });
      await expect(store.list()).rejects.toThrow(/^Broken run log r2\.jsonl, line 1: /u);
    });

    it("reads each log once over many lists, and again only when it changed", async () => {
      const shell = new FakeRunShell({ opened: [acme] });
      const store = new TauriRunStore(shell, acme);
      const runIds = Array.from(
        { length: 300 },
        (_, index) => `r${String(index).padStart(3, "0")}`,
      );
      for (const runId of runIds) {
        shell.plant(acme, runId, { log: formatLogLines([started(runId)]) });
      }
      const first = await store.list();
      expect(first).toHaveLength(300);
      for (let list = 0; list < 5; list += 1) {
        expect(await store.list()).toEqual(first);
      }
      expect(shell.logsRead).toEqual(runIds);

      await store.append("r007", 1, [entered("r007", 2)]);
      shell.plant(acme, "r300", { log: formatLogLines([started("r300")]) });
      const after = await store.list();
      expect(shell.logsRead.slice(300)).toEqual(["r007", "r300"]);
      expect(after).toHaveLength(301);
      expect(after.find((summary) => summary.id === "r007")).toEqual(await store.get("r007"));
    });

    it("gives each list its own summaries, so changing one doesn't change the next", async () => {
      const shell = new FakeRunShell({ opened: [acme] });
      const store = new TauriRunStore(shell, acme);
      shell.plant(acme, "r1", { log: formatLogLines([started("r1")]) });
      const [summary] = await store.list();
      (summary as { id: string }).id = "changed";
      expect((await store.list()).map(({ id }) => id)).toEqual(["r1"]);
    });

    it("passes on the shell's broken log as a plain error with its message", async () => {
      const shell = new FakeRunShell({ opened: [acme] });
      shell.refuseNext("broken_log");
      const error = await rejection(new TauriRunStore(shell, acme).events("r1"));
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(KindedError);
      expect(String(error)).toContain("refused by the test (broken_log)");
    });

    it("gives each other refusal its error kind", async () => {
      const expected: Record<Exclude<RunRefusalKind, "broken_log">, string> = {
        folder_not_open: "denied",
        invalid_deployment: "internal",
        invalid_run_id: "internal",
        invalid_lines: "internal",
        other_runs_log: "invalid_input",
        io: "unavailable",
      };
      for (const [refusal, kind] of Object.entries(expected)) {
        const shell = new FakeRunShell({ opened: [acme] });
        shell.refuseNext(refusal as RunRefusalKind);
        const error = await rejection(
          new TauriRunStore(shell, acme).append("r1", 0, [started("r1")]),
        );
        expect(errorKindOf(error), refusal).toBe(kind);
      }
    });

    it("rejects as unavailable, without the shell's text, when the page has no run capability", async () => {
      const store = new TauriRunStore(new FakeRunShell({ opened: [acme], granted: false }), acme);
      for (const call of [
        store.append("r1", 0, [started("r1")]),
        store.events("r1"),
        store.snapshot("r1"),
        store.list(),
      ]) {
        const error = await rejection(call);
        expect(errorKindOf(error)).toBe("unavailable");
        expect(String(error)).not.toContain("ACL");
      }
    });

    it("rejects an answer that isn't the command's as unavailable", async () => {
      const appends: unknown[] = [
        null,
        { ok: true },
        { ok: true, lastSeq: "1" },
        { ok: true, lastSeq: 1.5 },
        { ok: "yes", lastSeq: 1 },
        { ok: false, reason: "other", lastSeq: 1 },
        { ok: true, lastSeq: 1, snapshotError: 5 },
      ];
      for (const answer of appends) {
        const error = await rejection(answering(answer).append("r1", 0, [started("r1")]));
        expect(errorKindOf(error), JSON.stringify(answer)).toBe("unavailable");
      }
      expect(errorKindOf(await rejection(answering(7).events("r1")))).toBe("unavailable");
      for (const answer of [undefined, { text: 1, logEvents: 1 }, { text: "{}" }]) {
        const error = await rejection(answering(answer).snapshot("r1"));
        expect(errorKindOf(error), JSON.stringify(answer)).toBe("unavailable");
      }
      const logs: unknown[] = [
        "logs",
        [null],
        [{ runId: "r1" }],
        [{ runId: "r1", stamp: 1, lines: "" }],
        // Unchanged lines the store never had.
        [{ runId: "r1", stamp: "1:1", lines: null }],
      ];
      for (const answer of logs) {
        const error = await rejection(answering(answer).list());
        expect(errorKindOf(error), JSON.stringify(answer)).toBe("unavailable");
      }
    });
  });

  describe("isRunRefusal", () => {
    it("takes only the shell's run refusal shape", () => {
      expect(isRunRefusal({ kind: "io", message: "m" })).toBe(true);
      expect(isRunRefusal({ kind: "unreadable", message: "m" })).toBe(false);
      expect(isRunRefusal({ kind: "io", message: 1 })).toBe(false);
      expect(isRunRefusal("Command run_events not allowed by ACL")).toBe(false);
      expect(isRunRefusal(null)).toBe(false);
    });
  });
});

describe("the fake run shell", () => {
  it("refuses a command the shell doesn't have, unsafe ids, and lines that aren't whole", async () => {
    const shell = new FakeRunShell({ opened: [acme] });
    const folder = { workspace: acme, deployment: null };
    await expect(shell.invoke("run_open", { ...folder, runId: "r1" })).rejects.toBe(
      "Command run_open not found",
    );
    await expect(shell.invoke("run_events", { ...folder, runId: "../r1" })).rejects.toMatchObject({
      kind: "invalid_run_id",
    });
    const unsafeDeployment = { workspace: acme, deployment: "../nightly", runId: "r1" };
    await expect(shell.invoke("run_events", unsafeDeployment)).rejects.toMatchObject({
      kind: "invalid_deployment",
    });
    for (const lines of ["{}", "{}\n\n"]) {
      const args = { ...folder, runId: "r1", expectedSeq: 0, lines, snapshot: null };
      await expect(shell.invoke("run_append", args)).rejects.toMatchObject({
        kind: "invalid_lines",
      });
    }
    await expect(shell.invoke("run_logs")).rejects.toMatchObject({ kind: "folder_not_open" });
  });
});
