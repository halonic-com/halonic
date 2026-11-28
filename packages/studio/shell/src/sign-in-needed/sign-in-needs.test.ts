import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { defineFeature } from "../feature.ts";
import type { Registered } from "../points/point-store.ts";
import { createShell } from "../shell.ts";
import { ShellError } from "../shell-error.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import type { WorkspaceContext } from "../workspace-context.ts";
import type { SignInChannel } from "./sign-in-channel.ts";
import { focusRefreshIntervalMs, SignInNeeds, type SignInWindow } from "./sign-in-needs.ts";
import type { SignInContribution, SignInNeed, SignInOutcome, SignInReading } from "./sign-ins.ts";

const context = {} as WorkspaceContext;

/** The agent host every window shares: who is signed out now, per sign-in. */
class FakeHost {
  readonly needs = new Map<string, SignInNeed[]>();
  readonly failing = new Set<string>();

  reading(signInId: string): SignInReading {
    if (this.failing.has(signInId)) {
      return { kind: "unreadable", error: new Error("The agent host didn't answer.") };
    }
    return { kind: "read", needs: this.needs.get(signInId) ?? [] };
  }
}

/** Channels that reach each other but not themselves, as `BroadcastChannel` does. */
class FakeChannelHub {
  private readonly listeners = new Map<number, Set<() => void>>();
  private next = 0;

  channel(): SignInChannel {
    const id = this.next++;
    const own = new Set<() => void>();
    this.listeners.set(id, own);
    return {
      post: () => {
        for (const [other, listeners] of this.listeners) {
          if (other !== id) {
            for (const listener of listeners) listener();
          }
        }
      },
      subscribe: (listener) => {
        own.add(listener);
        return () => own.delete(listener);
      },
      close: () => this.listeners.delete(id),
    };
  }
}

function signIn(
  host: FakeHost,
  id: string,
  provider: string,
  blockingFor: SignInContribution["blockingFor"],
  start: SignInContribution["start"] = async () => ({ phrase: undefined, finished: pending() }),
): Registered<SignInContribution> {
  return {
    id,
    provider,
    logo: `${id}.svg`,
    purpose: "your workspace",
    blockingFor,
    featureId: "connections",
    watch: (_context, listener) => {
      listener(host.reading(id));
      return () => undefined;
    },
    start,
  };
}

function pending(): Promise<SignInOutcome> {
  return new Promise(() => undefined);
}

function needs(
  window: SignInWindow,
  signIns: readonly Registered<SignInContribution>[],
  options: {
    channel?: SignInChannel;
    timers?: FakeTimers;
    log?: () => void;
    openExternal?: (url: string) => Promise<void>;
  } = {},
): SignInNeeds {
  const result = new SignInNeeds({
    window,
    signIns,
    contextFor: () => context,
    channel: options.channel ?? new FakeChannelHub().channel(),
    timers: options.timers ?? new FakeTimers(),
    openExternal: options.openExternal ?? (async () => undefined),
    log: options.log ?? (() => undefined),
  });
  result.start();
  return result;
}

function names(signIns: readonly { name: string }[]): string[] {
  return signIns.map((shown) => shown.name);
}

verifies("shell.sign-in-needed", () => {
  describe("the point", () => {
    const watch: SignInContribution["watch"] = () => () => undefined;
    const start: SignInContribution["start"] = async () => ({
      phrase: undefined,
      finished: pending(),
    });
    const base = { provider: "Paperclip", logo: "p.svg", purpose: "agents", watch, start };

    it("lists the sign-ins features add, with the feature that added each", () => {
      const shell = createShell({
        features: [
          defineFeature({
            id: "connections",
            title: "Connections",
            register: (studio) =>
              studio.signIns.add({ ...base, id: "connections.paperclip", blockingFor: ["inbox"] }),
          }),
        ],
      });
      const [only] = shell.contributions.signIns.list();
      expect(only?.id).toBe("connections.paperclip");
      expect(only?.featureId).toBe("connections");
    });

    it("throws a ShellError for an app Halonic doesn't start, an empty provider or a taken id", () => {
      const shellWith = (contributions: SignInContribution[]) => () =>
        createShell({
          features: [
            defineFeature({
              id: "connections",
              title: "Connections",
              register: (studio) => {
                for (const contribution of contributions) studio.signIns.add(contribution);
              },
            }),
          ],
        });
      const runs = { ...base, id: "a", blockingFor: ["runs"] } as unknown as SignInContribution;
      expect(shellWith([runs])).toThrow(ShellError);
      expect(shellWith([{ ...base, id: "a", provider: " ", blockingFor: [] }])).toThrow(ShellError);
      const twice = { ...base, id: "a", blockingFor: [] };
      expect(shellWith([twice, twice])).toThrow(/connections/);
    });
  });

  describe("what a window shows", () => {
    it("blocks the apps a sign-in names, and shows it in the band in Studio's window", () => {
      const host = new FakeHost();
      host.needs.set("paperclip", [{ id: "acme", name: "Acme team" }]);
      const paperclip = signIn(host, "paperclip", "Paperclip", ["messenger", "inbox"]);

      const inbox = needs("inbox", [paperclip]).current();
      expect(names(inbox.blocking)).toEqual(["Acme team"]);
      expect(inbox.blocking[0]?.logo).toBe("paperclip.svg");
      expect(inbox.notBlocking).toEqual([]);

      const studio = needs("studio", [paperclip]).current();
      expect(studio.blocking).toEqual([]);
      expect(names(studio.notBlocking)).toEqual(["Acme team"]);
    });

    it("orders each list by provider, then by name", () => {
      const host = new FakeHost();
      host.needs.set("paperclip", [
        { id: "zeta", name: "Zeta" },
        { id: "acme", name: "Acme team" },
      ]);
      host.needs.set("google", [{ id: "me", name: "ada@acme.test" }]);
      host.needs.set("asana", [{ id: "me", name: "Acme" }]);
      const prompt = needs("messenger", [
        signIn(host, "paperclip", "Paperclip", ["messenger"]),
        signIn(host, "google", "Google", []),
        signIn(host, "asana", "Asana", []),
      ]).current();
      expect(names(prompt.blocking)).toEqual(["Acme team", "Zeta"]);
      expect(prompt.notBlocking.map((shown) => shown.provider)).toEqual(["Asana", "Google"]);
    });

    it("shows nothing once no sign-in is needed", () => {
      const prompt = needs("inbox", [signIn(new FakeHost(), "paperclip", "Paperclip", ["inbox"])]);
      expect(prompt.current()).toEqual({ blocking: [], notBlocking: [], unreadable: false });
    });
  });

  describe("clearing in every window", () => {
    it.each([
      ["Paperclip", ["inbox", "messenger"] as const],
      ["Google", [] as const],
    ])(
      "clears a %s sign-in in the other windows when it ends in one",
      async (provider, blocking) => {
        const host = new FakeHost();
        const hub = new FakeChannelHub();
        host.needs.set("sign-in", [{ id: "acme", name: "Acme team" }]);
        let finish: (outcome: SignInOutcome) => void = () => undefined;
        const finished = new Promise<SignInOutcome>((resolve) => {
          finish = resolve;
        });
        const contribution = signIn(host, "sign-in", provider, blocking, async () => ({
          phrase: "blue-otter",
          approvalUrl: "https://sign-in.acme.test/approve",
          finished,
        }));
        const opened: string[] = [];
        const inbox = needs("inbox", [contribution], {
          channel: hub.channel(),
          openExternal: async (url) => {
            opened.push(url);
          },
        });
        const messenger = needs("messenger", [contribution], { channel: hub.channel() });
        const shownIn = (window: SignInNeeds) => [
          ...window.current().blocking,
          ...window.current().notBlocking,
        ];

        const signingIn = inbox.signIn("sign-in/acme");
        await vi.waitFor(() =>
          expect(shownIn(inbox)[0]?.progress).toEqual({ kind: "waiting", phrase: "blue-otter" }),
        );
        expect(opened).toEqual(["https://sign-in.acme.test/approve"]);
        host.needs.set("sign-in", []);
        finish("signed-in");
        await signingIn;

        expect(shownIn(inbox)).toEqual([]);
        expect(shownIn(messenger)).toEqual([]);
      },
    );

    it("reads again on focus at most once per 5 seconds", () => {
      const host = new FakeHost();
      const timers = new FakeTimers();
      const window = needs("inbox", [signIn(host, "paperclip", "Paperclip", ["inbox"])], {
        timers,
      });
      host.needs.set("paperclip", [{ id: "acme", name: "Acme team" }]);

      timers.advance(2000);
      window.windowFocused();
      expect(window.current().blocking).toEqual([]);

      timers.advance(focusRefreshIntervalMs - 2000);
      window.windowFocused();
      expect(names(window.current().blocking)).toEqual(["Acme team"]);
    });
  });

  describe("failures", () => {
    it("logs a state it can't read, says so, and doesn't block for it", () => {
      const host = new FakeHost();
      host.failing.add("paperclip");
      const log = vi.fn();
      const window = needs("inbox", [signIn(host, "paperclip", "Paperclip", ["inbox"])], { log });
      expect(window.current()).toEqual({ blocking: [], notBlocking: [], unreadable: true });
      expect(log).toHaveBeenCalledWith(expect.stringContaining("paperclip"), expect.any(Error));

      host.failing.delete("paperclip");
      host.needs.set("paperclip", [{ id: "acme", name: "Acme team" }]);
      window.readAgain();
      expect(window.current().unreadable).toBe(false);
      expect(names(window.current().blocking)).toEqual(["Acme team"]);
    });

    it("does nothing more for a sign-in that ends after the window stopped", async () => {
      const host = new FakeHost();
      host.needs.set("paperclip", [{ id: "acme", name: "Acme team" }]);
      let finish: (outcome: SignInOutcome) => void = () => undefined;
      const finished = new Promise<SignInOutcome>((resolve) => {
        finish = resolve;
      });
      let watches = 0;
      const contribution: Registered<SignInContribution> = {
        ...signIn(host, "paperclip", "Paperclip", ["inbox"], async () => ({
          phrase: undefined,
          finished,
        })),
        watch: (_context, listener) => {
          watches++;
          listener(host.reading("paperclip"));
          return () => undefined;
        },
      };
      // As a real BroadcastChannel does, a closed channel throws on post.
      let closed = false;
      const channel: SignInChannel = {
        post: () => {
          if (closed) throw new Error("InvalidStateError: the channel is closed.");
        },
        subscribe: () => () => undefined,
        close: () => {
          closed = true;
        },
      };
      const log = vi.fn();
      const window = needs("inbox", [contribution], { channel, log });
      const signingIn = window.signIn("paperclip/acme");
      await vi.waitFor(() => expect(window.current().blocking[0]?.progress.kind).toBe("waiting"));

      window.stop();
      channel.close();
      finish("signed-in");

      await expect(signingIn).resolves.toBeUndefined();
      expect(watches).toBe(1);
      expect(log).not.toHaveBeenCalled();
    });

    it("keeps the row open and says it failed when the sign-in can't begin or doesn't finish", async () => {
      const host = new FakeHost();
      host.needs.set("paperclip", [{ id: "acme", name: "Acme team" }]);
      host.needs.set("google", [{ id: "me", name: "Ada" }]);
      const log = vi.fn();
      const window = needs(
        "inbox",
        [
          signIn(host, "paperclip", "Paperclip", ["inbox"], async () => {
            throw new Error("The agent host is offline.");
          }),
          signIn(host, "google", "Google", [], async () => ({
            phrase: undefined,
            finished: Promise.resolve("failed"),
          })),
        ],
        { log },
      );

      await window.signIn("paperclip/acme");
      await window.signIn("google/me");

      expect(window.current().blocking[0]?.progress).toEqual({ kind: "failed" });
      expect(window.current().notBlocking[0]?.progress).toEqual({ kind: "failed" });
      expect(log).toHaveBeenCalledTimes(1);
    });
  });
});
