import type { ActionRecordEvent } from "@halonicjs/events";
import { actionRecordsContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { ActionShellError } from "./action-shell-error.ts";
import { FakeRecordShell } from "./fake-record-shell.test-helper.ts";
import { TauriActionRecords } from "./tauri-action-records.ts";

// The port's contract against a mocked Tauri `invoke` that keeps JSON lines
// and refuses what the shell's allow-list refuses, as the shell does.
actionRecordsContract("tauri", async () => new TauriActionRecords(new FakeRecordShell()));

const at = "2026-11-25T09:00:00.000Z";
const started: ActionRecordEvent = { type: "action.step.started", request: "req-1", at, step: 1 };

function setUp() {
  const shell = new FakeRecordShell();
  return { shell, records: new TauriActionRecords(shell) };
}

async function failureOf(promise: Promise<unknown>): Promise<ActionShellError> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(error instanceof ActionShellError)) throw new Error(`not an ActionShellError: ${error}`);
  return error;
}

verifies("action-send-tauri.records", () => {
  describe("TauriActionRecords", () => {
    it("calls the shell's record commands by the shell's argument names", async () => {
      const { shell, records } = setUp();
      await records.append(started);
      expect(await records.read("req-1")).toEqual([started]);
      expect(shell.calls).toEqual([
        { command: "action_record_append", args: { event: started } },
        { command: "action_record_read", args: { request: "req-1" } },
      ]);
    });

    it("never sends an event the allow-list refuses", async () => {
      const { shell, records } = setUp();
      const smuggled = { ...started, authorization: "acme-fake-token" };
      await expect(records.append(smuggled)).rejects.toThrow(RangeError);
      expect(shell.calls).toEqual([]);
    });

    it("rejects with a RangeError when the shell's allow-list refuses the event", async () => {
      const { shell, records } = setUp();
      shell.refusals.set("action_record_append", {
        kind: "refused-event",
        message: "action event refused: step: out of range",
      });
      await expect(records.append(started)).rejects.toThrow(
        new RangeError(
          "Action event refused by the shell: action event refused: step: out of range",
        ),
      );
    });

    it("turns the shell's other failures into an ActionShellError", async () => {
      const { shell, records } = setUp();
      shell.refusals.set("action_record_append", { kind: "record-full", message: "full" });
      expect((await failureOf(records.append(started))).failure).toBe("record-full");
      shell.refusals.set("action_record_read", "action_record_read not allowed");
      expect((await failureOf(records.read("req-1"))).failure).toBe("ipc");
    });

    it("is checked against a mocked shell that refuses what the real one refuses", async () => {
      const { shell } = setUp();
      const smuggled = { ...started, authorization: "acme-fake-token" };
      await expect(shell.invoke("action_record_append", { event: smuggled })).rejects.toEqual({
        kind: "refused-event",
        message: "action event refused",
      });
      await expect(
        shell.invoke("action_record_read", { request: "req-1", path: "../escape" }),
      ).rejects.toMatchObject({ kind: "invalid_args" });
      expect(await shell.invoke("action_record_read", { request: "req-1" })).toEqual([]);
    });

    it("refuses a read the shell answers with something it doesn't know", async () => {
      const { shell, records } = setUp();
      const malformed = [
        { events: [started] },
        [{ ...started, token: "acme-fake-token" }],
        [{ ...started, request: "req-2" }],
        [{ type: "action.requested", request: "req-1", at }],
      ];
      for (const answer of malformed) {
        shell.answers.set("action_record_read", answer);
        expect((await failureOf(records.read("req-1"))).failure).toBe("malformed-answer");
      }
    });
  });
});
