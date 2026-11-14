import { formatRecordLines, type RecordChange } from "@halonicjs/ports";
import { errorKindOf } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { ShellCall } from "./fake-shell.test-helper.ts";
import { TauriGoogleSetupRecords } from "./google-setup-records.ts";
import type { TauriShell } from "./shell.ts";

const collection = "_google_setups";
const logFile = "/profile/google/setups/log.jsonl";

const accountSetup: RecordChange = {
  at: "2026-01-01T00:00:00.000Z",
  collection,
  id: "acct-acme",
  op: "add",
  values: { route: "own-app" },
};

/** A shell that records its calls and answers each with `answer`, or rejects with `refusal`. */
function shellAnswering(answer: unknown, refusal?: unknown): TauriShell & { calls: ShellCall[] } {
  const calls: ShellCall[] = [];
  return {
    calls,
    async invoke(command, args) {
      calls.push({ command, args });
      if (refusal !== undefined) {
        throw refusal;
      }
      return answer;
    },
  };
}

/** The error a call rejects with. */
async function rejection(action: Promise<unknown>): Promise<unknown> {
  return action.then(
    () => expect.unreachable("the call should have failed"),
    (reason: unknown) => reason,
  );
}

verifies("fs-tauri.google-setup-records", () => {
  describe("TauriGoogleSetupRecords", () => {
    it("reads the setup records with no argument and parses them as the port does", async () => {
      const shell = shellAnswering({ lines: formatRecordLines([accountSetup]), file: logFile });
      const records = new TauriGoogleSetupRecords(shell, collection);
      expect(await records.changes(collection)).toEqual([accountSetup]);
      expect(shell.calls).toEqual([{ command: "google_setup_read", args: {} }]);
    });

    it("answers a collection it was not made for as empty, without calling the shell", async () => {
      const shell = shellAnswering({ lines: "", file: logFile });
      expect(await new TauriGoogleSetupRecords(shell, collection).changes("leads")).toEqual([]);
      expect(shell.calls).toEqual([]);
    });

    it("refuses to append or compact, as denied, without calling the shell", async () => {
      const shell = shellAnswering({ lines: "", file: logFile });
      const records = new TauriGoogleSetupRecords(shell, collection);
      for (const write of [records.append([accountSetup]), records.compact(collection)]) {
        expect(errorKindOf(await rejection(write))).toBe("denied");
      }
      expect(shell.calls).toEqual([]);
    });

    it("rejects with the shell's message when the log is broken, naming the log", async () => {
      const refusal = { kind: "broken_log", message: `${logFile} isn't UTF-8` };
      const records = new TauriGoogleSetupRecords(shellAnswering(null, refusal), collection);
      expect(await rejection(records.changes(collection))).toMatchObject({
        message: refusal.message,
      });
    });

    it("rejects as unavailable when the shell gives no answer or one of the wrong shape", async () => {
      const failures = [
        shellAnswering(null, "Command google_setup_read not allowed by ACL"),
        shellAnswering(null),
        shellAnswering({ lines: 1, file: logFile }),
        shellAnswering({ lines: "" }),
      ];
      for (const shell of failures) {
        const records = new TauriGoogleSetupRecords(shell, collection);
        expect(errorKindOf(await rejection(records.changes(collection)))).toBe("unavailable");
      }
    });
  });
});
