import { ServiceRegistry } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeShell } from "./fake-shell.test-helper.ts";
import {
  provideServerSessionShell,
  serverSessionShellKey,
  unknownShellAnswer,
} from "./shell-server-session.ts";

/** An invented request: task `HAL-1234` on the `acme` organisation's Paperclip. */
const request = {
  task: "HAL-1234",
  brief: "Task: https://paperclip.acme.example/HAL/issues/HAL-1234\n",
  requestHash: "rev-2",
};

/** The opener over a shell whose `server_session_open` answers `answer`. */
function openerAnswering(answer: unknown) {
  const shell = new FakeShell().answer("server_session_open", () => answer);
  const services = new ServiceRegistry();
  expect(provideServerSessionShell(services, { __TAURI_INTERNALS__: shell }, "linux")).toBe(true);
  return { shell, opener: services.get(serverSessionShellKey) };
}

verifies("services.server-session-shell", () => {
  describe("provideServerSessionShell", () => {
    it("provides nothing in a browser", () => {
      const services = new ServiceRegistry();
      expect(provideServerSessionShell(services, {}, "macos")).toBe(false);
      expect(services.has(serverSessionShellKey)).toBe(false);
    });

    it("provides nothing on Windows, even in the desktop app", () => {
      const services = new ServiceRegistry();
      const page = { __TAURI_INTERNALS__: new FakeShell() };
      expect(provideServerSessionShell(services, page, "windows")).toBe(false);
      expect(services.has(serverSessionShellKey)).toBe(false);
    });

    it("sends exactly the task, the brief and the request hash", async () => {
      const { shell, opener } = openerAnswering({ kind: "terminal-opened" });
      // The offer also names who asked; the shell must never get it.
      const offer = { ...request, requester: "Chief" };
      expect(await opener.open(offer)).toEqual({ kind: "terminal-opened" });
      expect(shell.calls).toEqual([{ command: "server_session_open", args: request }]);
    });

    it("passes on each answer the shell knows", async () => {
      for (const kind of ["cancelled", "no-terminal", "not-configured", "unsupported-platform"]) {
        expect(await openerAnswering({ kind }).opener.open(request)).toEqual({ kind });
      }
      const refused = { kind: "refused", reason: "the server isn't set up" };
      expect(await openerAnswering(refused).opener.open(request)).toEqual(refused);
    });

    it("turns an answer it doesn't know into a refusal", async () => {
      const unknown = { kind: "refused", reason: unknownShellAnswer };
      for (const answer of [null, "terminal-opened", { kind: "exploded" }, { kind: "refused" }]) {
        expect(await openerAnswering(answer).opener.open(request)).toEqual(unknown);
      }
    });

    it("rejects when the shell refuses the command", async () => {
      const services = new ServiceRegistry();
      provideServerSessionShell(services, { __TAURI_INTERNALS__: new FakeShell() }, "macos");
      await expect(services.get(serverSessionShellKey).open(request)).rejects.toBe(
        "command server_session_open not allowed",
      );
    });
  });
});
