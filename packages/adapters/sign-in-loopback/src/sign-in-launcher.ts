import { pendingSignInLifetimeMs } from "@halonicjs/oauth-sign-in";
import type { BrowserOpener } from "./browser-opener.ts";
import { type LoopbackServer, startLoopbackServer } from "./loopback-server.ts";

/** The answer of a flow that started a sign-in. */
export interface StartedSignIn {
  readonly kind: "started";
  readonly authorizeUrl: string;
  readonly callbackPath: string;
}

/**
 * The part of the host's `SignInFlow` the launcher uses, so this package needs
 * nothing of the host. `Refusal` is whatever the flow says when a sign-in
 * can't start, such as `{ kind: "unknown" }`.
 */
export interface LauncherFlow<Refusal extends { readonly kind: string }> {
  start(signIn: string, port: number): Promise<StartedSignIn | Refusal>;
  handleCallback(request: Request): Promise<Response>;
  cancel(signIn: string): void;
}

/** What {@link createSignInLauncher} needs. */
export interface SignInLauncherSettings<Refusal extends { readonly kind: string }> {
  readonly flow: LauncherFlow<Refusal>;
  readonly browser: BrowserOpener;
  /** How long a sign-in may wait for the browser to come back. Default: a pending sign-in's lifetime. */
  readonly lifetimeMs?: number;
  /** Starts the server. Default: a real one on `127.0.0.1`. */
  readonly startServer?: typeof startLoopbackServer;
}

/**
 * How `begin` went.
 * - `started`: the sign-in is pending. `opened` says whether the browser was
 *   opened; when it wasn't, show `authorizeUrl` for the user to open themselves.
 * - `refused`: the flow didn't start it; `reason` is the flow's own answer.
 */
export type BeginResult<Refusal extends { readonly kind: string }> =
  | { readonly kind: "started"; readonly authorizeUrl: string; readonly opened: boolean }
  | { readonly kind: "refused"; readonly reason: Refusal };

/** What Studio calls to sign in: one object that owns the local server and the browser. */
export interface SignInLauncher<Refusal extends { readonly kind: string }> {
  /**
   * Starts the local server when none runs, starts the sign-in on its port
   * and opens the browser at the provider. The server stops by itself when
   * no sign-in waits any more: after the callback came, after `cancel`, or
   * after `lifetimeMs`.
   */
  begin(signIn: string): Promise<BeginResult<Refusal>>;
  /** Drops a pending sign-in; its callback then gets the flow's plain 400. */
  cancel(signIn: string): Promise<void>;
  /** Cancels every pending sign-in and stops the server. */
  close(): Promise<void>;
}

/** One sign-in waiting for the browser. */
interface Waiting {
  readonly signIn: string;
  readonly timer: ReturnType<typeof setTimeout>;
}

/**
 * The app's side of a sign-in: a loopback server for the callback, the
 * flow behind it and the browser. A callback path is answered once; after
 * its answer the sign-in no longer waits.
 *
 * @example
 * const launcher = createSignInLauncher({ flow, browser: createSystemBrowserOpener() });
 * const result = await launcher.begin("work-account");
 */
export function createSignInLauncher<Refusal extends { readonly kind: string }>(
  settings: SignInLauncherSettings<Refusal>,
): SignInLauncher<Refusal> {
  const { flow, browser } = settings;
  const lifetimeMs = settings.lifetimeMs ?? pendingSignInLifetimeMs;
  const startServer = settings.startServer ?? startLoopbackServer;
  const waiting = new Map<string, Waiting>();
  let server: Promise<LoopbackServer> | undefined;

  function serverForCallbacks(): Promise<LoopbackServer> {
    server ??= startServer(handleRequest).catch((error: unknown) => {
      server = undefined;
      throw error;
    });
    return server;
  }

  async function handleRequest(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    const response = await flow.handleCallback(request);
    // The flow answers a pending path once, whatever it carried, so the sign-in is over.
    if (waiting.has(pathname)) {
      await stopWaiting(pathname);
    }
    return response;
  }

  async function stopWaiting(callbackPath: string): Promise<void> {
    const entry = waiting.get(callbackPath);
    if (entry === undefined) return;
    clearTimeout(entry.timer);
    waiting.delete(callbackPath);
    await stopServerWhenIdle();
  }

  async function stopServerWhenIdle(): Promise<void> {
    if (waiting.size > 0 || server === undefined) return;
    const stopping = server;
    server = undefined;
    // Closing waits for open connections; the answer in flight is written first.
    void stopping.then((running) => running.close());
  }

  function pathsOf(signIn: string): string[] {
    return [...waiting].filter(([, entry]) => entry.signIn === signIn).map(([path]) => path);
  }

  async function begin(signIn: string): Promise<BeginResult<Refusal>> {
    const running = await serverForCallbacks();
    const started = await flow.start(signIn, running.port);
    if (!isStarted(started)) {
      await stopServerWhenIdle();
      return { kind: "refused", reason: started };
    }
    // The flow replaced an earlier sign-in of this name, so its path is dead.
    for (const path of pathsOf(signIn)) {
      clearTimeout(waiting.get(path)?.timer);
      waiting.delete(path);
    }
    const timer = setTimeout(() => void cancelPath(started.callbackPath), lifetimeMs);
    timer.unref();
    waiting.set(started.callbackPath, { signIn, timer });
    const opened = await browser.open(started.authorizeUrl);
    return { kind: "started", authorizeUrl: started.authorizeUrl, opened };
  }

  async function cancelPath(callbackPath: string): Promise<void> {
    const entry = waiting.get(callbackPath);
    if (entry === undefined) return;
    flow.cancel(entry.signIn);
    await stopWaiting(callbackPath);
  }

  return {
    begin,
    async cancel(signIn) {
      flow.cancel(signIn);
      for (const path of pathsOf(signIn)) {
        await stopWaiting(path);
      }
    },
    async close() {
      for (const path of [...waiting.keys()]) {
        await cancelPath(path);
      }
    },
  };
}

function isStarted(result: { readonly kind: string }): result is StartedSignIn {
  return result.kind === "started";
}
