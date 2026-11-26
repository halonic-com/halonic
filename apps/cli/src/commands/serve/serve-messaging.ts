// The server engine's agent messaging (`server.paperclip-key-store`, HAL-17512 S4): one
// Paperclip provider for each connection file in the engine workspace whose key the owner
// stored in the serve profile's secret store, joined by the hub, with the cache in front.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { CachedAgentMessaging } from "@halonicjs/adapter-agent-messaging-cache";
import {
  type PaperclipAnswer,
  type PaperclipKeyGuard,
  PaperclipMessaging,
  paperclipSourceId,
} from "@halonicjs/adapter-paperclip-client";
import { parsePaperclipConnection } from "@halonicjs/format";
import {
  type MessagingFailure,
  MessagingHub,
  type PaperclipConnectionNow,
  type PaperclipKeyEntry,
  PaperclipKeys,
  paperclipOrigin,
} from "@halonicjs/host-agent-messaging-hub";
import { type AgentMessaging, type SecretStore, tokenNamePrefix } from "@halonicjs/ports";
import { PAPERCLIP_CONNECTIONS_FOLDER } from "@halonicjs/workspace";
import { SwappableMessaging } from "./swappable-messaging.ts";

/** A connection's name: its file name without `.yaml`, as the desktop host allows it. */
const connectionNamePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u;

const signedOut: PaperclipAnswer = { kind: "failed", failure: "signed-out" };

/**
 * The name a connection's Paperclip key is stored under in the serve profile's secret store.
 * It is a token's name, the one the desktop keychain uses for the same connection, so the
 * `/api/secrets/<name>` routes, a workspace's secrets and `halonic secret` all refuse it and
 * `halonic secret list` leaves it out.
 *
 * @example
 * paperclipKeySecretName("halonic"); // "halonic_token_paperclip-halonic"
 */
export function paperclipKeySecretName(connection: string): string {
  return `${tokenNamePrefix}paperclip-${connection}`;
}

/** What {@link openServeMessaging} needs. */
export interface ServeMessagingOptions {
  /** The engine workspace's real path; it holds the connection files and never a key. */
  workspace: string;
  /**
   * The serve profile's own secrets file, read at every request. Never the environment or the
   * command line: a key there would sit in the service's unit, an image or CI.
   */
  keys: Pick<SecretStore, "get">;
  /** The cache's folder, in the profile; it must be outside `workspace`. */
  cacheFolder: string;
  /** Hears every provider failure the server carries on past. */
  report: (failure: MessagingFailure) => void;
  /** Says which cache file was broken and read as missing, and which optional read failed. */
  warn: (message: string) => void;
  /** The `fetch` the providers send with; the global one by default. */
  fetch?: typeof fetch;
  now?: () => Date;
}

/** The server's messaging, and the connections that have a stored key. */
export interface ServeMessaging {
  /** One port for the server's whole life; {@link rebuild} changes what is behind it. */
  readonly messaging: AgentMessaging;
  /** The sources whose provider started at the last build; empty when no key is stored. */
  readonly connected: readonly string[];
  /** Reads every source of the last build again, for the server's poll loop (`server.messaging-rate`). */
  refresh(): Promise<void>;
  /**
   * Makes the providers again from the stored keys, after a sign-in stored a key or Disconnect
   * removed one, and names `connection`'s source to every `changes` reader. Builds run one at a
   * time, in the order they were asked for, so the last one asked for is the one that stays.
   */
  rebuild(connection: string): Promise<void>;
}

/**
 * Opens the server's messaging: a provider for each connection file that has a stored key,
 * made for the address and company the key was made for. A connection file alone makes no
 * provider, so a server without stored keys calls nobody.
 *
 * @throws when the cache folder is inside the engine workspace
 */
export async function openServeMessaging(options: ServeMessagingOptions): Promise<ServeMessaging> {
  let built = await joinedProviders(options);
  const swappable = new SwappableMessaging(built.messaging, (error) =>
    options.report({ provider: "messaging-hub", action: "changes", error }),
  );
  let latest = Promise.resolve();
  const rebuildNow = async (connection: string): Promise<void> => {
    built = await joinedProviders(options);
    swappable.swap(built.messaging, [paperclipSourceId(connection)]);
  };
  return {
    messaging: swappable,
    get connected() {
      return built.connected;
    },
    refresh: () => built.hub.refresh(),
    rebuild(connection) {
      const next = latest.then(() => rebuildNow(connection));
      // The caller hears this build's failure; the next build still runs.
      latest = next.catch(() => undefined);
      return next;
    },
  };
}

/** The hub over a provider for each connection with a stored key, with the cache in front, and the hub alone. */
async function joinedProviders(
  options: ServeMessagingOptions,
): Promise<{ messaging: AgentMessaging; hub: MessagingHub; connected: readonly string[] }> {
  const { workspace, report, warn } = options;
  const providers: { name: string; messaging: AgentMessaging }[] = [];
  for (const connection of await connectionNames(workspace)) {
    const provider = await storedKeyProvider(options, connection);
    if (provider !== undefined) {
      providers.push({ name: paperclipSourceId(connection), messaging: provider });
    }
  }
  const hub = new MessagingHub({ providers, report });
  const messaging = new CachedAgentMessaging(hub, {
    folder: options.cacheFolder,
    workspaceRoots: [workspace],
    warn,
  });
  return { messaging, hub, connected: providers.map((provider) => provider.name) };
}

/**
 * The provider for one connection, or `undefined` when no usable key is stored for it or its
 * file is gone. Every request goes through {@link storedKeyGuard}.
 */
async function storedKeyProvider(
  options: ServeMessagingOptions,
  connection: string,
): Promise<PaperclipMessaging | undefined> {
  const { workspace, keys } = options;
  const madeFor = await readStoredKey(keys, connection);
  const file = await readConnectionFile(workspace, connection);
  if (madeFor === undefined || file === undefined) return undefined;
  return new PaperclipMessaging({
    address: madeFor.address,
    key: storedKeyGuard(workspace, keys, connection, madeFor),
    connection,
    company: madeFor.company,
    label: `Paperclip · ${file.label}`,
    warn: options.warn,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.now === undefined ? {} : { now: options.now }),
  });
}

/**
 * The key guard of HAL-17495 for `connection`'s stored key: at every request it reads the record
 * again from the store and the connection file again from `workspace`, and sends the request,
 * with the key, only when the file's address and company still match the record's and the
 * address is still the one `madeFor` was read with. Otherwise it answers `signed-out`.
 */
export function storedKeyGuard(
  workspace: string,
  keys: Pick<SecretStore, "get">,
  connection: string,
  madeFor: PaperclipKeyEntry,
): PaperclipKeyGuard {
  const binding = { workspace, connection };
  return async (request) => {
    const entry = await readStoredKey(keys, connection);
    const now = await readConnectionFile(workspace, connection);
    if (entry === undefined || now === undefined) return signedOut;
    // A guard of its own for this one request, holding only the record read just now.
    const guarded = new PaperclipKeys();
    guarded.replace(binding, entry);
    return guarded.callWith(binding, now, (use) =>
      use.origin === paperclipOrigin(madeFor.address)
        ? request(use.key)
        : Promise.resolve(signedOut),
    );
  };
}

/**
 * The record stored for `connection`, or `undefined` when there is none, it isn't a record, or
 * its address isn't one a key may go to (`https`, or plain `http` to this computer). Never
 * throws with the stored text.
 */
export async function readStoredKey(
  keys: Pick<SecretStore, "get">,
  connection: string,
): Promise<PaperclipKeyEntry | undefined> {
  const text = await keys.get(paperclipKeySecretName(connection));
  if (text === null) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;
  const { key, address, company } = value as Record<string, unknown>;
  if (typeof key !== "string" || typeof address !== "string" || typeof company !== "string") {
    return undefined;
  }
  return paperclipOrigin(address) === undefined ? undefined : { key, address, company };
}

/** The names of the workspace's connection files that the name rule allows, sorted. */
export async function connectionNames(workspace: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(join(workspace, PAPERCLIP_CONNECTIONS_FOLDER));
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.endsWith(".yaml"))
    .map((entry) => entry.slice(0, -".yaml".length))
    .filter((name) => connectionNamePattern.test(name))
    .sort();
}

/** The connection file as it is now, or `undefined` when it is gone or fails its checks. */
export async function readConnectionFile(
  workspace: string,
  connection: string,
): Promise<(PaperclipConnectionNow & { label: string }) | undefined> {
  const path = join(workspace, PAPERCLIP_CONNECTIONS_FOLDER, `${connection}.yaml`);
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
  const parsed = parsePaperclipConnection(text);
  return parsed.ok ? parsed.value.value : undefined;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
