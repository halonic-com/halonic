import type { ActionRoute } from "@halonicjs/ports";
import { FakeActionSender } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { ActionShellError } from "./action-shell-error.ts";
import { acmeUserCode, FakeActionShell } from "./fake-shell.test-helper.ts";
import { TauriActionSender } from "./tauri-action-sender.ts";

const approveRun: ActionRoute = {
  kind: "call",
  definition: "github.approve-run",
  version: 1,
  step: 1,
  service: "github",
  risk: "routine",
  method: "POST",
  path: "/repos/{owner}/{repo}/actions/runs/{runId}/approve",
  placeholders: { owner: "[a-z]+", repo: "[a-z]+", runId: "[0-9]+" },
  body: [],
  keep: ["id"],
};
const step = {
  definition: "github.approve-run",
  version: 1,
  step: 1,
  placeholders: { owner: "acme", repo: "app", runId: "7" },
};

function setUp() {
  const decider = new FakeActionSender({ routes: [approveRun], signInAs: { github: "acme-dev" } });
  const shell = new FakeActionShell(decider, [approveRun]);
  return { shell, sender: new TauriActionSender(shell) };
}

async function failureOf(promise: Promise<unknown>): Promise<ActionShellError> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(error instanceof ActionShellError))
    throw new Error(`expected an ActionShellError, got ${String(error)}`);
  return error;
}

verifies("action-send-tauri.commands", () => {
  describe("TauriActionSender commands", () => {
    it("passes the page's request on by the shell's argument names, and nothing else", async () => {
      const { shell, sender } = setUp();
      await sender.signIn("github");
      await sender.send(step);
      await sender.openGuided(step);
      await sender.openPage("https://github.com/acme/app/settings");
      await sender.account("github");
      await sender.signOut("github");
      await sender.cancelSignIn();
      expect(shell.calls).toEqual([
        { command: "action_sign_in", args: { service: "github", code: "__CHANNEL__:0" } },
        { command: "action_send", args: { request: step } },
        { command: "action_open_guided", args: { request: step } },
        { command: "action_open_page", args: { url: "https://github.com/acme/app/settings" } },
        { command: "action_account", args: { service: "github" } },
        { command: "action_sign_out", args: { service: "github" } },
        { command: "action_sign_in_cancel", args: {} },
      ]);
    });

    it("shows the device code from the sign-in's channel, then closes the channel", async () => {
      const { shell, sender } = setUp();
      const shown: unknown[] = [];
      const result = await sender.signIn("github", (code) => shown.push(code));
      expect(result).toEqual({
        outcome: "signed-in",
        account: { service: "github", name: "acme-dev" },
      });
      expect(shown).toEqual([acmeUserCode]);
      expect(shell.openChannels).toEqual([]);
    });

    it("cancels the sign-in and rejects when the channel brings something that isn't a code", async () => {
      const { shell, sender } = setUp();
      shell.codeMessages = [{ ...acmeUserCode, token: "acme-fake-token" }];
      const error = await failureOf(sender.signIn("github"));
      expect(error.failure).toBe("malformed-answer");
      expect(shell.calls.map((call) => call.command)).toContain("action_sign_in_cancel");
      expect(shell.openChannels).toEqual([]);
    });

    it("keeps the cancel's own failure as the cause when it can't cancel", async () => {
      const { shell, sender } = setUp();
      shell.codeMessages = [
        { code: "ACME-1234", page: "http://github.com/login/device", expiresIn: 900 },
      ];
      shell.refusals.set("action_sign_in_cancel", "action_sign_in_cancel not allowed");
      const error = await failureOf(sender.signIn("github"));
      expect(error.failure).toBe("malformed-answer");
      expect(error.cause).toMatchObject({ failure: "ipc" });
    });

    it("turns the shell's refusals into an ActionShellError with the shell's kind", async () => {
      const { shell, sender } = setUp();
      shell.refusals.set("action_sign_in", {
        kind: "too-often",
        message: "a sign-in page opened a moment ago",
      });
      const tooOften = await failureOf(sender.signIn("github"));
      expect([tooOften.failure, tooOften.message]).toEqual([
        "too-often",
        "a sign-in page opened a moment ago",
      ]);
      shell.refusals.set("action_send", "action_send not allowed. Command not found");
      const notAllowed = await failureOf(sender.send(step));
      expect(notAllowed.failure).toBe("ipc");
      expect(notAllowed.message).toContain("not allowed");
      shell.refusals.set("action_account", new Error("the IPC is gone"));
      expect((await failureOf(sender.account("github"))).message).toContain("the IPC is gone");
      shell.refusals.set("action_sign_out", { kind: "denied", message: "the keychain said no" });
      expect((await failureOf(sender.signOut("github"))).failure).toBe("denied");
      shell.refusals.set("action_sign_in_cancel", { kind: 3 });
      expect((await failureOf(sender.cancelSignIn())).failure).toBe("ipc");
      shell.refusals.set("action_sign_out", { kind: "exploded", message: "a newer shell's kind" });
      expect((await failureOf(sender.signOut("github"))).failure).toBe("malformed-answer");
    });

    it("says nobody is signed in to a service the shell has no sign-in for", async () => {
      const { sender } = setUp();
      expect(await sender.account("npm")).toBeUndefined();
      await expect(sender.signOut("npm")).resolves.toBeUndefined();
    });

    it("rejects a sign-in that failed with the shell's sentence", async () => {
      const { shell, sender } = setUp();
      shell.answers.set("action_sign_in", {
        outcome: "failed",
        reason: "GitHub turned the sign-in down.",
      });
      const error = await failureOf(sender.signIn("github"));
      expect([error.failure, error.message]).toEqual([
        "sign-in-failed",
        "GitHub turned the sign-in down.",
      ]);
    });

    it("is checked against a mocked shell that refuses what the real one refuses", async () => {
      const { shell } = setUp();
      const invalidArgs = { kind: "invalid_args" };
      await expect(
        shell.invoke("action_send", { request: step, token: "x" }),
      ).rejects.toMatchObject(invalidArgs);
      await expect(shell.invoke("action_delete", { service: "github" })).rejects.toContain(
        "not allowed",
      );
      const noChannel = { service: "github", code: "__CHANNEL__:9" };
      await expect(shell.invoke("action_sign_in", noChannel)).rejects.toContain("no channel");
    });

    it("rejects an open the browser didn't make", async () => {
      const { shell, sender } = setUp();
      shell.answers.set("action_open_page", { outcome: "not-opened" });
      expect((await failureOf(sender.openPage("https://github.com/acme"))).failure).toBe(
        "not-opened",
      );
    });
  });
});
