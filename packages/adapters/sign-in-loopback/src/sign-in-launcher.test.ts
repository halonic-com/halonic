import { type BrowserChoice, createSignInRig, signInName } from "@halonicjs/testing-sign-in";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserOpener } from "./browser-opener.ts";
import { type LoopbackServer, startLoopbackServer } from "./loopback-server.ts";
import { createSignInLauncher, type SignInLauncher } from "./sign-in-launcher.ts";

/** The pieces of one test: the rig's flow behind the launcher, a browser that goes where the user would, and the servers started. */
function setUp(choice?: BrowserChoice, opens = true) {
  const rig = createSignInRig();
  const servers: LoopbackServer[] = [];
  const visited: URL[] = [];
  const pages: Response[] = [];
  const browser: BrowserOpener = {
    async open(url) {
      // The user approves (or not) at the provider and the browser comes back to the callback.
      const callbackUrl = rig.server.approve(url, choice);
      visited.push(callbackUrl);
      if (opens) pages.push(await fetch(callbackUrl));
      return opens;
    },
  };
  const launcher = createSignInLauncher({
    flow: rig.flow,
    browser,
    startServer: async (handler) => {
      const server = await startLoopbackServer(handler);
      servers.push(server);
      return server;
    },
  });
  return { rig, launcher, servers, visited, pages };
}

/** Whether something still listens on the port of `server`. */
async function isListening(server: LoopbackServer | undefined): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${server?.port}/`);
    return true;
  } catch {
    return false;
  }
}

const launchers: SignInLauncher<{ kind: string }>[] = [];

function track<T extends SignInLauncher<{ kind: string }>>(launcher: T): T {
  launchers.push(launcher);
  return launcher;
}

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(launchers.splice(0).map((launcher) => launcher.close()));
});

verifies("sign-in-loopback.sign-in-launcher", () => {
  describe("a sign-in the user approves", () => {
    it("reaches the flow through the real server and stops the server after the callback", async () => {
      const { rig, launcher, servers, pages } = setUp();
      track(launcher);

      const result = await launcher.begin(signInName);

      expect(result).toMatchObject({ kind: "started", opened: true });
      expect(rig.outcomes).toEqual([
        { kind: "signedIn", signIn: signInName, missingScopes: [], extraScopes: [] },
      ]);
      expect(pages[0]?.status).toBe(200);
      expect(rig.store.size).toBeGreaterThan(0);
      expect(servers).toHaveLength(1);
      await vi.waitFor(async () => expect(await isListening(servers[0])).toBe(false));
    });

    it("never shows a code or a token on the page", async () => {
      const { rig, launcher, pages } = setUp();
      track(launcher);

      await launcher.begin(signInName);

      const text = (await pages[0]?.text()) ?? "";
      expect(text).not.toMatch(/code|token|fake-/i);
      expect(rig.server.requestsCarrying(text)).toEqual([]);
    });
  });

  describe("a user who denies", () => {
    it("ends with the flow's outcome and stops the server", async () => {
      const { rig, launcher, servers, pages } = setUp({ user: "deny" });
      track(launcher);

      await launcher.begin(signInName);

      expect(rig.outcomes).toMatchObject([{ kind: "cancelled", signIn: signInName }]);
      expect(pages[0]?.status).toBe(400);
      await vi.waitFor(async () => expect(await isListening(servers[0])).toBe(false));
    });
  });

  describe("a sign-in the sheet doesn't have", () => {
    it("is refused with the flow's reason, opens no browser and leaves no server running", async () => {
      const { launcher, servers, visited } = setUp();
      track(launcher);

      const result = await launcher.begin("no-such-sign-in");

      expect(result).toEqual({ kind: "refused", reason: { kind: "unknown" } });
      expect(visited).toEqual([]);
      await vi.waitFor(async () => expect(await isListening(servers[0])).toBe(false));
    });
  });

  describe("a browser that can't be opened", () => {
    it("leaves the sign-in pending and says so, with the address to show", async () => {
      const { rig, launcher, servers, visited } = setUp(undefined, false);
      track(launcher);

      const result = await launcher.begin(signInName);

      expect(result).toMatchObject({ kind: "started", opened: false });
      const authorizeUrl = result.kind === "started" ? result.authorizeUrl : "";
      expect(await isListening(servers[0])).toBe(true);
      // The user opens the address by hand and the sign-in still ends.
      await fetch(visited[0] as URL);
      expect(rig.outcomes).toMatchObject([{ kind: "signedIn" }]);
      expect(authorizeUrl).toContain("code_challenge=");
    });
  });

  describe("a cancel", () => {
    it("makes the callback get the flow's 400 and stops the server", async () => {
      const { rig, launcher, servers, visited } = setUp(undefined, false);
      track(launcher);
      await launcher.begin(signInName);

      await launcher.cancel(signInName);
      await vi.waitFor(async () => expect(await isListening(servers[0])).toBe(false));

      expect(rig.outcomes).toEqual([]);
      const answer = await rig.flow.handleCallback(new Request(visited[0] as URL));
      expect(answer.status).toBe(400);
    });
  });

  describe("a sign-in left past its lifetime", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    });

    it("is cancelled and the server stops", async () => {
      const rig = createSignInRig();
      const servers: LoopbackServer[] = [];
      const launcher = track(
        createSignInLauncher({
          flow: rig.flow,
          browser: { open: async () => true },
          lifetimeMs: 1000,
          startServer: async (handler) => {
            const server = await startLoopbackServer(handler);
            servers.push(server);
            return server;
          },
        }),
      );
      const result = await launcher.begin(signInName);
      expect(await isListening(servers[0])).toBe(true);

      await vi.advanceTimersByTimeAsync(1000);

      await vi.waitFor(async () => expect(await isListening(servers[0])).toBe(false));
      expect(result.kind).toBe("started");
    });
  });

  describe("a second begin for the same sign-in", () => {
    it("kills the first one's link and keeps one server", async () => {
      const { rig, launcher, servers, visited } = setUp(undefined, false);
      track(launcher);
      await launcher.begin(signInName);
      await launcher.begin(signInName);

      const first = await fetch(visited[0] as URL);
      const second = await fetch(visited[1] as URL);

      expect(first.status).toBe(400);
      expect(second.status).toBe(200);
      expect(rig.outcomes).toMatchObject([{ kind: "signedIn" }]);
      expect(servers).toHaveLength(1);
    });
  });

  describe("a begin that waits for the flow to start", () => {
    /** A launcher whose flow holds every `start` until the test lets it go, in the order of the calls. */
    function setUpGated() {
      const rig = createSignInRig();
      const servers: LoopbackServer[] = [];
      const visited: URL[] = [];
      const gates: (() => void)[] = [];
      const launcher = track(
        createSignInLauncher({
          flow: {
            start: async (signIn, port) => {
              await new Promise<void>((release) => gates.push(release));
              return rig.flow.start(signIn, port);
            },
            handleCallback: (request) => rig.flow.handleCallback(request),
            cancel: (signIn) => rig.flow.cancel(signIn),
          },
          browser: {
            async open(url) {
              visited.push(rig.server.approve(url));
              return false;
            },
          },
          startServer: async (handler) => {
            const server = await startLoopbackServer(handler);
            servers.push(server);
            return server;
          },
        }),
      );
      return { launcher, servers, visited, gates };
    }

    it("keeps the server when another begin is refused meanwhile", async () => {
      const { launcher, servers, visited, gates } = setUpGated();
      const refused = launcher.begin("no-such-sign-in");
      const wanted = launcher.begin(signInName);
      await vi.waitFor(() => expect(gates).toHaveLength(2));

      gates[0]?.();
      expect(await refused).toEqual({ kind: "refused", reason: { kind: "unknown" } });
      gates[1]?.();
      expect(await wanted).toMatchObject({ kind: "started" });

      expect(servers).toHaveLength(1);
      expect(await isListening(servers[0])).toBe(true);
      expect((await fetch(visited[0] as URL)).status).toBe(200);
    });

    it("keeps the server when a pending sign-in's callback arrives meanwhile", async () => {
      const { launcher, servers, visited, gates } = setUpGated();
      const first = launcher.begin(signInName);
      await vi.waitFor(() => expect(gates).toHaveLength(1));
      gates[0]?.();
      await first;
      const second = launcher.begin(signInName);
      await vi.waitFor(() => expect(gates).toHaveLength(2));

      // The browser of the first sign-in comes back while the second one waits for the flow.
      expect((await fetch(visited[0] as URL)).status).toBe(200);
      gates[1]?.();
      expect(await second).toMatchObject({ kind: "started" });

      expect(servers).toHaveLength(1);
      expect(await isListening(servers[0])).toBe(true);
      expect((await fetch(visited[1] as URL)).status).toBe(200);
    });
  });
});
