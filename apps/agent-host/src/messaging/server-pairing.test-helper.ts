import { AgentHostServerEngine } from "@halonicjs/adapter-agent-host-client";
import type { SecretStore } from "@halonicjs/ports";
import { KeychainError } from "../secrets/shell-keychain-secret-store.ts";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { type Desktop, pageTransport, startDesktop } from "./desktop-messaging.test-helper.ts";
import { ServerEnginePairing } from "./server-pairing.ts";
import { serverPairingRoutes } from "./server-pairing-routes.ts";

export const pendingId = "a".repeat(64);
export const expiresAt = "2026-11-24T14:10:00.000Z";
export const sessionEndsAt = "2027-02-22T14:00:00.000Z";

/** What the fake server saw: the path, the body's text and whether a token came with it. */
export interface SeenPairingCall {
  path: string;
  body: string;
  authorization: string | null;
}

/**
 * A Halonic server's pairing routes on Acme's address. Each answer can be
 * replaced; `unreachable` makes every call fail as a dead network does.
 */
export class FakePairingServer {
  readonly seen: SeenPairingCall[] = [];
  unreachable = false;
  hello = () => json({ product: "halonic", version: "0.2.0", minAppVersion: "0.1.0" });
  pair = () => json({ pendingId, checkCode: "4F72KQ", expiresAt });
  status = () => json({ state: "waiting", expiresAt }, 202);
  cancel = () => new Response(null, { status: 204 });
  signOut = () => new Response(null, { status: 204 });

  /** The device token Allow hands out: the canary. */
  readonly token: string;

  constructor(token: string) {
    this.token = token;
  }

  /** The owner pressed Allow: the next status answer holds the token. */
  allow(): void {
    this.status = () => json({ state: "allowed", token: this.token, sessionEndsAt });
  }

  readonly fetch = async (input: URL | Request | string, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    const body = await request.text();
    this.seen.push({ path, body, authorization: request.headers.get("authorization") });
    if (this.unreachable) throw new TypeError(`fetch failed for ${request.url}`);
    const answers: Record<string, () => Response> = {
      "/api/hello": this.hello,
      "/api/pair": this.pair,
      "/api/pair/status": this.status,
      "/api/pair/cancel": this.cancel,
      "/api/devices/sign-out": this.signOut,
    };
    return (answers[path] ?? (() => json({ code: "not_found" }, 404)))();
  };

  /** The calls to one path. */
  calls(path: string): SeenPairingCall[] {
    return this.seen.filter((call) => call.path === path);
  }
}

/**
 * The host's keychain, over the desktop's own store, that can be told to
 * fail. Each failure's message holds the token, as a platform's might, so a
 * test sees whether that text leaks.
 */
export class PairingKeychain implements SecretStore {
  failSet = false;
  failGet = false;
  failRemove = false;
  /** Gives back another value than the one saved. */
  garbleGet = false;

  readonly #store: SecretStore;
  readonly #canary: string;

  constructor(store: SecretStore, canary: string) {
    this.#store = store;
    this.#canary = canary;
  }

  async get(name: string): Promise<string | null> {
    if (this.failGet) throw this.#failure("read");
    const value = await this.#store.get(name);
    return this.garbleGet && value !== null ? `${value}-garbled` : value;
  }

  async set(name: string, value: string): Promise<void> {
    if (this.failSet) throw this.#failure("save");
    await this.#store.set(name, value);
  }

  async remove(name: string): Promise<void> {
    if (this.failRemove) throw this.#failure("remove");
    await this.#store.remove(name);
  }

  names(): Promise<readonly string[]> {
    return this.#store.names();
  }

  #failure(doing: string): KeychainError {
    return new KeychainError("denied", `The keychain couldn't ${doing} ${this.#canary}`);
  }
}

/** The desktop with the pairing routes, Studio's stand-in and the fakes behind them. */
export interface PairingDesktop extends Desktop {
  pairingServer: FakePairingServer;
  pairingKeychain: PairingKeychain;
  engine: AgentHostServerEngine;
  /** Sends one raw request to a pairing route, as a page of another site would with `site`. */
  raw(name: string, body: unknown, site?: string): Promise<{ status: number; text: string }>;
}

/**
 * {@link startDesktop} with the server engine's pairing routes on a host of
 * their own, over the same messaging, setting and keychain. Without a
 * keychain the routes answer 409 `keychain_needed`.
 */
export async function startPairingDesktop(options = { keychain: true }): Promise<PairingDesktop> {
  const desktop = await startDesktop();
  const pairingServer = new FakePairingServer(desktop.server.token);
  const pairingKeychain = new PairingKeychain(desktop.keychain, desktop.server.token);
  const log = (text: string) => desktop.logged.push(text);
  const pairing = options.keychain
    ? new ServerEnginePairing({
        messaging: desktop.messaging,
        setting: desktop.setting,
        keychain: pairingKeychain,
        log,
        fetch: pairingServer.fetch,
        computerName: "acme-mbp",
      })
    : undefined;
  const token = randomLaunchToken();
  const host: HostServer = await startHostServer(
    token,
    serverPairingRoutes({ messaging: desktop.messaging, pairing, log }),
  );
  const transport = pageTransport(host.url, token, desktop.answers);
  return {
    ...desktop,
    pairingServer,
    pairingKeychain,
    engine: new AgentHostServerEngine(transport, desktop.workspace),
    raw: async (name, body, site = "same-origin") => {
      const response = await fetch(`${host.url}/v1/messaging/server-engine/${name}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "sec-fetch-site": site,
        },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      desktop.answers.push(text);
      return { status: response.status, text };
    },
    close: async () => {
      await host.close();
      await desktop.close();
    },
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
