import type { PaperclipKeyHandOver } from "@halonicjs/adapter-agent-host-client";
import type { TokenStore } from "@halonicjs/ports";

/** A Paperclip key as the keychain keeps it: with the address and company it was made for. */
export interface PaperclipKeyEntry {
  readonly key: string;
  /** The address the key was made for, such as `https://paperclip.acme.test`. */
  readonly address: string;
  /** The Paperclip company's ID the key was made for. */
  readonly company: string;
}

/**
 * The keychain name of a connection's key: a token, so it sits under the
 * shell's token prefix, which a workspace's secrets and the shell's secret
 * commands refuse. No connector, model or plugin can read it by naming it.
 *
 * @param connection - the connection's name, its file name without `.yaml`
 *
 * @example
 * paperclipKeyTokenName("halonic"); // "paperclip-halonic"
 */
export function paperclipKeyTokenName(connection: string): string {
  return `paperclip-${connection}`;
}

/**
 * The text the keychain keeps for `entry`: the key with the address and company it was made for.
 *
 * @example
 * await tokens.set(paperclipKeyTokenName("halonic"), paperclipKeyEntryText(entry));
 */
export function paperclipKeyEntryText(entry: PaperclipKeyEntry): string {
  return JSON.stringify({ key: entry.key, address: entry.address, company: entry.company });
}

/** The entry the keychain's `text` holds, or `undefined` when it isn't one; never throws with the text. */
function entryOf(text: string): PaperclipKeyEntry | undefined {
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
  return { key, address, company };
}

/** What Connect did: handed the key to the engine, or found none the person signed in with. */
export type PaperclipConnectResult = "connected" | "sign-in-needed";

/**
 * Connect, the person's own action for one Paperclip connection
 * (`services.paperclip-connect`): reads the connection's key from the
 * keychain and hands it, with the address and company it was made for, to
 * the agent host, which keeps it in memory only. Opening a workspace never
 * calls this, so a connection file alone sends nothing anywhere. The key
 * never comes back from it.
 *
 * @param tokens - the keychain's tokens, from `tokenStoreKey`
 * @param host - the agent host's hand-over, an `AgentHostPaperclipKey`
 * @param connection - the connection's name, its file name without `.yaml`
 * @returns `sign-in-needed` when the keychain holds no key for the connection, or one it can't read
 * @throws AgentHostError when the host refuses the key or can't be reached; KeychainError when the keychain can't be read
 */
export async function connectPaperclip(
  tokens: Pick<TokenStore, "get">,
  host: { handOver(entry: PaperclipKeyHandOver): Promise<void> },
  connection: string,
): Promise<PaperclipConnectResult> {
  const text = await tokens.get(paperclipKeyTokenName(connection));
  const entry = text === null ? undefined : entryOf(text);
  if (entry === undefined) return "sign-in-needed";
  await host.handOver({ connection, ...entry });
  return "connected";
}
