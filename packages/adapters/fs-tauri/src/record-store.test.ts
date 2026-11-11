import { formatRecordLines, type RecordChange } from "@halonicjs/ports";
import { errorKindOf, KindedError } from "@halonicjs/std";
import { recordStoreContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeRecordShell } from "./fake-record-shell.test-helper.ts";
import { isRecordRefusal, type RecordRefusalKind } from "./record-commands.ts";
import { TauriRecordStore } from "./record-store.ts";
import type { TauriShell } from "./shell.ts";

const acme = "/workspaces/acme";

// The contract runs against the fake shell. That the shell keeps the logs
// as `FileRecordStore` keeps them, under the same write lock, is proved on
// real files by the Rust tests of crates/record-store.
recordStoreContract(
  "tauri",
  async () => new TauriRecordStore(new FakeRecordShell({ opened: [acme] }), acme),
);

function added(collection: string, id: string, second = 0): RecordChange {
  return {
    at: new Date(Date.UTC(2026, 0, 1, 0, 0, second)).toISOString(),
    collection,
    id,
    op: "add",
    values: { name: id },
  };
}

/** The error a call rejects with. */
async function rejection(action: Promise<unknown>): Promise<unknown> {
  return action.then(
    () => expect.unreachable("the call should have failed"),
    (reason: unknown) => reason,
  );
}

/** A store whose shell answers every call with `answer`. */
function answering(answer: unknown): TauriRecordStore {
  const shell: TauriShell = { invoke: async () => answer };
  return new TauriRecordStore(shell, acme);
}

verifies("fs-tauri.collections-persist", () => {
  describe("TauriRecordStore", () => {
    it("names the workspace in every call, and sends each collection's changes as log lines", async () => {
      const shell = new FakeRecordShell({ opened: [acme] });
      const store = new TauriRecordStore(shell, acme);
      const [first, lead, second] = [
        added("orders", "o-1"),
        added("leads", "1"),
        added("orders", "o-2"),
      ];
      await store.append([first, lead, second]);
      await store.changes("orders");
      expect(shell.calls).toEqual([
        {
          command: "record_append",
          args: {
            workspace: acme,
            appends: [
              { collection: "orders", lines: formatRecordLines([first, second]) },
              { collection: "leads", lines: formatRecordLines([lead]) },
            ],
          },
        },
        { command: "record_read", args: { workspace: acme, collection: "orders" } },
      ]);
    });

    it("reads a collection the CLI wrote, and keeps it after the app opens again", async () => {
      const shell = new FakeRecordShell({ opened: [acme] });
      shell.plant(acme, "orders", formatRecordLines([added("orders", "o-1")]));
      expect(await new TauriRecordStore(shell, acme).changes("orders")).toEqual([
        added("orders", "o-1"),
      ]);
      await new TauriRecordStore(shell, acme).append([added("orders", "o-2", 1)]);
      const reopened = new TauriRecordStore(shell, acme);
      expect((await reopened.changes("orders")).map((change) => change.id)).toEqual(["o-1", "o-2"]);
    });

    it("sends nothing for no changes, and compacts a collection with no log without writing", async () => {
      const shell = new FakeRecordShell({ opened: [acme] });
      const store = new TauriRecordStore(shell, acme);
      await store.append([]);
      await store.compact("orders");
      expect(shell.calls.map((call) => call.command)).toEqual(["record_read"]);
    });

    it("folds a change appended during a compact rather than losing it", async () => {
      const shell = new FakeRecordShell({ opened: [acme] });
      const store = new TauriRecordStore(shell, acme);
      await store.append([added("orders", "o-1")]);
      let appendedOnce = false;
      shell.beforeReplace(() => {
        if (!appendedOnce) {
          appendedOnce = true;
          // Another writer, between the compact's read and its replace.
          shell.plant(
            acme,
            "orders",
            `${shell.log(acme, "orders")}${formatRecordLines([added("orders", "o-2", 1)])}`,
          );
        }
      });
      await store.compact("orders");
      const changes = await store.changes("orders");
      expect(changes.map((change) => [change.id, change.op])).toEqual([
        ["o-1", "seed"],
        ["o-2", "seed"],
      ]);
    });

    it("removes the log of a collection compacted to no records", async () => {
      const shell = new FakeRecordShell({ opened: [acme] });
      const store = new TauriRecordStore(shell, acme);
      const removed: RecordChange = { ...added("orders", "o-1", 1), op: "remove", values: null };
      await store.append([added("orders", "o-1"), removed]);
      await store.compact("orders");
      expect(shell.log(acme, "orders")).toBeUndefined();
      expect(await store.changes("orders")).toEqual([]);
    });

    it("gives up with conflict when the collection keeps changing", async () => {
      const shell = new FakeRecordShell({ opened: [acme] });
      const store = new TauriRecordStore(shell, acme);
      await store.append([added("orders", "o-1")]);
      let next = 2;
      shell.beforeReplace(() => {
        const change = added("orders", `o-${next}`, next);
        next += 1;
        shell.plant(acme, "orders", `${shell.log(acme, "orders")}${formatRecordLines([change])}`);
      });
      const error = await rejection(store.compact("orders"));
      expect(errorKindOf(error)).toBe("conflict");
      expect(shell.calls.filter((call) => call.command === "record_replace")).toHaveLength(5);
    });

    it("refuses a workspace the person didn't open in the shell as denied", async () => {
      const store = new TauriRecordStore(new FakeRecordShell({ opened: [] }), acme);
      expect(errorKindOf(await rejection(store.append([added("orders", "o-1")])))).toBe("denied");
      expect(errorKindOf(await rejection(store.changes("orders")))).toBe("denied");
    });

    it("names the log of a line that is broken, as fs-node does", async () => {
      const shell = new FakeRecordShell({ opened: [acme] });
      shell.plant(acme, "orders", formatRecordLines([added("leads", "1")]));
      await expect(new TauriRecordStore(shell, acme).changes("orders")).rejects.toThrow(
        'Broken record log "/profile/records/orders.jsonl", line 1: it holds a change to another collection, "leads".',
      );
    });

    it.each(["broken_log", "linked_log"] as const)(
      "passes on a %s as a plain error with the shell's message",
      async (kind) => {
        const shell = new FakeRecordShell({ opened: [acme] });
        shell.refuseNext(kind);
        const error = await rejection(new TauriRecordStore(shell, acme).changes("orders"));
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(KindedError);
        expect(isRecordRefusal((error as Error).cause)).toBe(true);
        expect(String(error)).toContain(`refused by the test (${kind})`);
      },
    );

    it("gives each other refusal its error kind", async () => {
      const expected: Record<Exclude<RecordRefusalKind, "broken_log" | "linked_log">, string> = {
        folder_not_open: "denied",
        invalid_lines: "internal",
        io: "unavailable",
      };
      for (const [refusal, kind] of Object.entries(expected)) {
        const shell = new FakeRecordShell({ opened: [acme] });
        shell.refuseNext(refusal as RecordRefusalKind);
        const error = await rejection(
          new TauriRecordStore(shell, acme).append([added("orders", "o-1")]),
        );
        expect(errorKindOf(error), refusal).toBe(kind);
        expect(String(error), refusal).toContain(`refused by the test (${refusal})`);
      }
    });

    it("rejects as unavailable, without the shell's text, when the page has no record capability", async () => {
      const shell = new FakeRecordShell({ opened: [acme], granted: false });
      const store = new TauriRecordStore(shell, acme);
      for (const call of [
        store.append([added("orders", "o-1")]),
        store.changes("orders"),
        store.compact("orders"),
      ]) {
        const error = await rejection(call);
        expect(errorKindOf(error)).toBe("unavailable");
        expect(String(error)).not.toContain("ACL");
      }
    });

    it("rejects an answer that isn't the command's as unavailable", async () => {
      const read = { lines: formatRecordLines([added("orders", "o-1")]), version: "v1", file: "f" };
      for (const answer of [
        null,
        5,
        { lines: "" },
        { ...read, version: 1 },
        { ...read, file: 1 },
      ]) {
        const error = await rejection(answering(answer).changes("orders"));
        expect(errorKindOf(error), JSON.stringify(answer)).toBe("unavailable");
      }
      const shell: TauriShell = {
        invoke: async (command) => (command === "record_read" ? read : { status: "done" }),
      };
      const error = await rejection(new TauriRecordStore(shell, acme).compact("orders"));
      expect(errorKindOf(error)).toBe("unavailable");
    });

    it("has a fake shell that refuses what the Rust shell refuses", async () => {
      const shell = new FakeRecordShell({ opened: [acme] });
      const refused = async (command: string, args: Record<string, unknown>) =>
        rejection(shell.invoke(command, { workspace: acme, ...args }));
      const torn = formatRecordLines([added("orders", "o-1")]).trimEnd();
      expect(
        await refused("record_append", { appends: [{ collection: "orders", lines: torn }] }),
      ).toMatchObject({ kind: "invalid_lines" });
      expect(
        await refused("record_replace", { collection: "orders", version: "v", lines: "{\n" }),
      ).toMatchObject({ kind: "invalid_lines" });
      expect(await refused("record_list", {})).toBe("Command record_list not found");
      const missing = { workspace: acme, collection: "orders", version: "v", lines: "" };
      expect(await shell.invoke("record_replace", missing)).toEqual({ status: "changed" });
    });
  });
});
