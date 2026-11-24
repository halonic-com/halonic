import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { AgentNotice, Notifier } from "./agent-notifications.ts";
import { FakeShell } from "./fake-shell.test-helper.ts";
import { ShellNotifier } from "./shell-notifications.ts";

const notice: AgentNotice = {
  reason: "card",
  title: "New card from Liam",
  body: "Ship it?",
  target: { kind: "inbox-item", id: "card" },
};

const never = () => {
  throw new Error("the shell reports no click on desktop");
};

verifies("services.agent-notifications", () => {
  describe("ShellNotifier", () => {
    it("shows a notification through the shell's plugin when it may", async () => {
      const shell = new FakeShell()
        .answer("plugin:notification|is_permission_granted", () => true)
        .answer("plugin:notification|notify", () => null);
      const notifier: Notifier = new ShellNotifier(shell);
      await notifier.show(notice, never);
      await notifier.show(notice, never);
      expect(shell.callsOf("plugin:notification|is_permission_granted")).toHaveLength(1);
      expect(shell.callsOf("plugin:notification|notify")).toEqual([
        { options: { title: "New card from Liam", body: "Ship it?" } },
        { options: { title: "New card from Liam", body: "Ship it?" } },
      ]);
    });

    it("asks the person once, and shows nothing when they say no", async () => {
      const shell = new FakeShell()
        .answer("plugin:notification|is_permission_granted", () => null)
        .answer("plugin:notification|request_permission", () => "denied");
      const notifier: Notifier = new ShellNotifier(shell);
      await notifier.show(notice, never);
      await notifier.show(notice, never);
      expect(shell.callsOf("plugin:notification|request_permission")).toHaveLength(1);
      expect(shell.callsOf("plugin:notification|notify")).toEqual([]);
    });

    it("shows notifications once the person says yes", async () => {
      const shell = new FakeShell()
        .answer("plugin:notification|is_permission_granted", () => false)
        .answer("plugin:notification|request_permission", () => "granted")
        .answer("plugin:notification|notify", () => null);
      const notifier: Notifier = new ShellNotifier(shell);
      await notifier.show(notice, never);
      expect(shell.callsOf("plugin:notification|notify")).toHaveLength(1);
    });
  });
});
