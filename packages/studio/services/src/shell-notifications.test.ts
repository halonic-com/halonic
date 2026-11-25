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
  throw new Error("no click was reported");
};

const fail = (error: unknown) => {
  throw error;
};

const shown = {
  options: {
    title: "New card from Liam",
    body: "Ship it?",
    extra: { messagingId: "card", kind: "inbox-item" },
  },
};

/** The callback argument the notifier passed to `plugin:event|listen` for `event`. */
function listenerOf(shell: FakeShell, event: string): number {
  const call = shell.callsOf("plugin:event|listen").find((args) => args["event"] === event);
  if (call === undefined) throw new Error(`nobody listens to ${event}`);
  return Number(call["handler"]);
}

/** A shell that lets the page listen to events, and sends one as Tauri does. */
function listeningShell(): FakeShell {
  let nextEvent = 1;
  return new FakeShell().answer("plugin:event|listen", () => nextEvent++);
}

function emit(shell: FakeShell, event: string, payload: unknown): void {
  shell.send(`__CHANNEL__:${listenerOf(shell, event)}`, { event, id: 1, payload });
}

verifies("services.agent-notifications", () => {
  describe("ShellNotifier", () => {
    it("shows a notification through the shell's plugin when it may", async () => {
      const shell = listeningShell()
        .answer("plugin:notification|is_permission_granted", () => true)
        .answer("plugin:notification|notify", () => null);
      const notifier: Notifier = new ShellNotifier(shell, fail);
      await notifier.show(notice, never);
      await notifier.show(notice, never);
      expect(shell.callsOf("plugin:notification|is_permission_granted")).toHaveLength(1);
      expect(shell.callsOf("plugin:notification|notify")).toEqual([shown, shown]);
    });

    it("asks the person once, and shows nothing when they say no", async () => {
      const shell = listeningShell()
        .answer("plugin:notification|is_permission_granted", () => null)
        .answer("plugin:notification|request_permission", () => "denied");
      const notifier: Notifier = new ShellNotifier(shell, fail);
      await notifier.show(notice, never);
      await notifier.show(notice, never);
      expect(shell.callsOf("plugin:notification|request_permission")).toHaveLength(1);
      expect(shell.callsOf("plugin:notification|notify")).toEqual([]);
    });

    it("shows notifications once the person says yes", async () => {
      const shell = listeningShell()
        .answer("plugin:notification|is_permission_granted", () => false)
        .answer("plugin:notification|request_permission", () => "granted")
        .answer("plugin:notification|notify", () => null);
      const notifier: Notifier = new ShellNotifier(shell, fail);
      await notifier.show(notice, never);
      expect(shell.callsOf("plugin:notification|notify")).toHaveLength(1);
    });

    it("calls onClick when the shell reports a click on that notification", async () => {
      const shell = listeningShell()
        .answer("plugin:notification|is_permission_granted", () => true)
        .answer("plugin:notification|notify", () => null);
      const notifier = new ShellNotifier(shell, fail);
      const clicked: string[] = [];
      await notifier.show(notice, () => clicked.push("card"));
      const chat: AgentNotice = {
        ...notice,
        reason: "question",
        target: { kind: "conversation", id: "chat" },
      };
      await notifier.show(chat, () => clicked.push("chat"));
      emit(shell, "notification-clicked", { messagingId: "chat", kind: "conversation" });
      emit(shell, "notification-clicked", { messagingId: "card", kind: "conversation" });
      emit(shell, "notification-clicked", { messagingId: "other", kind: "inbox-item" });
      emit(shell, "notification-clicked", "not an item");
      emit(shell, "notification-clicked", { messagingId: 7 });
      emit(shell, "notification-clicked", { messagingId: "chat", kind: 7 });
      shell.send(`__CHANNEL__:${listenerOf(shell, "notification-clicked")}`, null);
      shell.send(`__CHANNEL__:${listenerOf(shell, "notification-clicked")}`, { event: "x" });
      expect(clicked).toEqual(["chat"]);
      // A click only opens: the notifier calls nothing else in the shell.
      expect(shell.calls.map((call) => call.command)).toEqual([
        "plugin:event|listen",
        "plugin:event|listen",
        "plugin:notification|is_permission_granted",
        "plugin:notification|notify",
        "plugin:notification|notify",
      ]);
    });

    it("gives a summary no item, so its click opens nothing", async () => {
      const shell = listeningShell()
        .answer("plugin:notification|is_permission_granted", () => true)
        .answer("plugin:notification|notify", () => null);
      const notifier = new ShellNotifier(shell, fail);
      const summary: AgentNotice = {
        reason: "summary",
        title: "3 new",
        body: "",
        target: { kind: "inbox", id: "" },
      };
      await notifier.show(summary, never);
      emit(shell, "notification-clicked", { messagingId: "" });
      expect(shell.callsOf("plugin:notification|notify")).toEqual([
        { options: { title: "3 new", body: "", extra: {} } },
      ]);
    });

    it("reports a listener the shell refuses, and still shows", async () => {
      const shell = new FakeShell()
        .answer("plugin:notification|is_permission_granted", () => true)
        .answer("plugin:notification|notify", () => null);
      const errors: unknown[] = [];
      await new ShellNotifier(shell, (error) => errors.push(error)).show(notice, never);
      await Promise.resolve();
      expect(errors).toEqual([
        "command plugin:event|listen not allowed",
        "command plugin:event|listen not allowed",
      ]);
      expect(shell.callsOf("plugin:notification|notify")).toHaveLength(1);
    });
  });
});

verifies("services.agent-notification-permission", () => {
  describe("ShellNotifier after a no", () => {
    it("asks again after a no once the window gets focus", async () => {
      let answer = "denied";
      const shell = listeningShell()
        .answer("plugin:notification|is_permission_granted", () => false)
        .answer("plugin:notification|request_permission", () => answer)
        .answer("plugin:notification|notify", () => null);
      const notifier = new ShellNotifier(shell, fail);
      await notifier.show(notice, never);
      answer = "granted";
      emit(shell, "tauri://focus", null);
      await Promise.resolve();
      await notifier.show(notice, never);
      emit(shell, "tauri://focus", null);
      await Promise.resolve();
      await notifier.show(notice, never);
      expect(shell.callsOf("plugin:notification|request_permission")).toHaveLength(2);
      expect(shell.callsOf("plugin:notification|notify")).toHaveLength(2);
    });

    it("asks again after a no on the next start", async () => {
      const shell = listeningShell()
        .answer("plugin:notification|is_permission_granted", () => false)
        .answer("plugin:notification|request_permission", () => "denied");
      await new ShellNotifier(shell, fail).show(notice, never);
      await new ShellNotifier(shell, fail).show(notice, never);
      expect(shell.callsOf("plugin:notification|request_permission")).toHaveLength(2);
    });

    it("asks only once after a no, however often the window gets focus", async () => {
      const shell = listeningShell()
        .answer("plugin:notification|is_permission_granted", () => false)
        .answer("plugin:notification|request_permission", () => "denied");
      const notifier = new ShellNotifier(shell, fail);
      await notifier.show(notice, never);
      emit(shell, "tauri://focus", null);
      await Promise.resolve();
      emit(shell, "tauri://focus", null);
      await notifier.show(notice, never);
      expect(shell.callsOf("plugin:notification|request_permission")).toHaveLength(2);
    });

    it("asks again on focus after the ask itself failed", async () => {
      let refuse = true;
      const shell = listeningShell()
        .answer("plugin:notification|is_permission_granted", () => {
          if (refuse) throw new Error("no shell");
          return true;
        })
        .answer("plugin:notification|notify", () => null);
      const notifier = new ShellNotifier(shell, () => undefined);
      await notifier.show(notice, never).catch(() => undefined);
      refuse = false;
      emit(shell, "tauri://focus", null);
      await Promise.resolve();
      await Promise.resolve();
      await notifier.show(notice, never);
      expect(shell.callsOf("plugin:notification|is_permission_granted")).toHaveLength(2);
      expect(shell.callsOf("plugin:notification|notify")).toHaveLength(1);
    });

    it("keeps a newer ask that started before an older no was forgotten", async () => {
      const shell = listeningShell()
        .answer("plugin:notification|is_permission_granted", () => false)
        .answer("plugin:notification|request_permission", () => "denied");
      const notifier = new ShellNotifier(shell, fail);
      await notifier.show(notice, never);
      emit(shell, "tauri://focus", null);
      emit(shell, "tauri://focus", null);
      await Promise.resolve();
      await Promise.resolve();
      await notifier.show(notice, never);
      expect(shell.callsOf("plugin:notification|request_permission")).toHaveLength(2);
    });

    it("stops listening and forgets every click when disposed", async () => {
      const shell = listeningShell()
        .answer("plugin:notification|is_permission_granted", () => true)
        .answer("plugin:notification|notify", () => null)
        .answer("plugin:event|unlisten", () => null);
      const notifier = new ShellNotifier(shell, fail);
      await notifier.show(notice, never);
      const clickListener = listenerOf(shell, "notification-clicked");
      const focusListener = listenerOf(shell, "tauri://focus");

      await notifier.dispose();
      shell.send(`__CHANNEL__:${clickListener}`, {
        event: "notification-clicked",
        id: 1,
        payload: { messagingId: "card", kind: "inbox-item" },
      });
      await notifier.show(notice, never);

      expect(shell.callsOf("plugin:event|unlisten")).toEqual([
        { event: "notification-clicked", eventId: 1 },
        { event: "tauri://focus", eventId: 2 },
      ]);
      expect(shell.registered(`__CHANNEL__:${clickListener}`)).toBe(false);
      expect(shell.registered(`__CHANNEL__:${focusListener}`)).toBe(false);
      expect(shell.callsOf("plugin:notification|notify")).toHaveLength(1);
    });

    it("shows nothing when disposed while it asks the person", async () => {
      let answer: (granted: boolean) => void = () => undefined;
      const shell = listeningShell()
        .answer(
          "plugin:notification|is_permission_granted",
          () => new Promise<boolean>((resolve) => (answer = resolve)),
        )
        .answer("plugin:notification|notify", () => null)
        .answer("plugin:event|unlisten", () => null);
      const notifier = new ShellNotifier(shell, fail);
      const showing = notifier.show(notice, never);
      const disposing = notifier.dispose();
      answer(true);
      await Promise.all([showing, disposing]);
      expect(shell.callsOf("plugin:notification|notify")).toEqual([]);
    });

    it("reports an unlisten the shell refused, and skips a listener it never had", async () => {
      const refused = new Error("unlisten refused");
      let listens = 0;
      const shell = new FakeShell()
        .answer("plugin:event|listen", () => {
          listens += 1;
          if (listens === 2) throw new Error("no focus events here");
          return listens;
        })
        .answer("plugin:notification|is_permission_granted", () => true)
        .answer("plugin:notification|notify", () => null)
        .answer("plugin:event|unlisten", () => {
          throw refused;
        });
      const errors: unknown[] = [];
      const notifier = new ShellNotifier(shell, (error) => errors.push(error));
      await notifier.show(notice, never);
      await notifier.dispose();
      expect(shell.callsOf("plugin:event|unlisten")).toEqual([
        { event: "notification-clicked", eventId: 1 },
      ]);
      expect(errors).toEqual([new Error("no focus events here"), refused]);
    });
  });
});
