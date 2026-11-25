import type {
  PaperclipConnectionList,
  PaperclipConnectionRow,
  PaperclipKeyHandOver,
} from "@halonicjs/adapter-agent-host-client";
import type { TokenStore } from "@halonicjs/ports";
import {
  type PaperclipKeyEntry,
  paperclipKeyEntryOf,
  paperclipKeyTokenName,
} from "./paperclip-key.ts";

/** What {@link restorePaperclipKeys} needs. */
export interface PaperclipRestoreOptions {
  /** The agent host's list of the open workspace's connections, with its real path. */
  readonly listed: () => Promise<PaperclipConnectionList>;
  /** The keychain's tokens, where each connection's key is kept. */
  readonly tokens: Pick<TokenStore, "get">;
  /** The agent host's hand-over, an `AgentHostPaperclipKey`. */
  readonly host: { handOver(entry: PaperclipKeyHandOver): Promise<void> };
  /** The open workspace's path, as Studio names it to the host. */
  readonly workspace: string;
  /** Hears each failure; the connection then stays on Sign in again. */
  readonly report: (error: unknown) => void;
}

/**
 * Gives the agent host back the keys the person signed in with in this
 * workspace, when it opens (`services.paperclip-restore`). For each
 * connection the host lists as signed out, it reads the keychain once and
 * hands the key over only when the entry names this workspace (its real
 * path, as the host resolved it) and was made for the address and company
 * the connection file names now. Otherwise, such as in a clone or after the
 * file changed, it hands nothing over and the row stays on Sign in again.
 *
 * It never asks the person anything and never throws: a failure is reported,
 * and that connection stays signed out. Nothing is tried again.
 *
 * @returns how many keys it handed over
 */
export async function restorePaperclipKeys(options: PaperclipRestoreOptions): Promise<number> {
  const { listed, report } = options;
  const list = await listed().catch((error: unknown) => {
    report(error);
    return undefined;
  });
  if (list === undefined) return 0;
  let restored = 0;
  for (const row of list.connections) {
    if (row.state.kind !== "signed-out") continue;
    const handedOver = await restoreOne(options, list.workspace, row).catch((error: unknown) => {
      report(error);
      return false;
    });
    if (handedOver) restored++;
  }
  return restored;
}

/** Hands one connection's key back when its entry fits; whether it did. */
async function restoreOne(
  options: PaperclipRestoreOptions,
  realWorkspace: string,
  row: PaperclipConnectionRow,
): Promise<boolean> {
  const text = await options.tokens.get(paperclipKeyTokenName(row.name));
  const entry = text === null ? undefined : paperclipKeyEntryOf(text);
  if (entry === undefined || !fitsRow(entry, row, realWorkspace)) return false;
  const { key, address, company } = entry;
  const ref = { workspace: options.workspace, connection: row.name };
  await options.host.handOver({ ...ref, key, address, company });
  return true;
}

/** Whether `entry` was signed in from `realWorkspace`, for the address and company `row`'s file names. */
function fitsRow(
  entry: Required<PaperclipKeyEntry>,
  row: PaperclipConnectionRow,
  realWorkspace: string,
): boolean {
  const signedInHere = entry.workspaces.some((each) => sameWorkspace(each, realWorkspace));
  return signedInHere && sameOrigin(entry.address, row.address) && entry.company === row.company;
}

/**
 * Whether two real paths, as the agent host resolves them, name one folder.
 * A Windows path (`C:\…` or `\\server\…`) is compared without regard to
 * case, as Windows treats it; any other path exactly.
 *
 * So two spellings of one Windows folder that differ only in case match,
 * and on Linux two folders whose names differ only in case don't.
 */
export function sameWorkspace(first: string, second: string): boolean {
  if (first === second) return true;
  if (!isWindowsPath(first) || !isWindowsPath(second)) return false;
  return first.toLowerCase() === second.toLowerCase();
}

/** Whether `path` is a Windows one: a drive letter, or a share's `\\server\…`. */
function isWindowsPath(path: string): boolean {
  return /^[A-Za-z]:[\\/]/u.test(path) || path.startsWith("\\\\");
}

/**
 * Whether two addresses have the same scheme, host and port: the part the
 * host's key guard compares before every call.
 */
export function sameOrigin(first: string, second: string): boolean {
  const origin = (address: string) => (URL.canParse(address) ? new URL(address).origin : undefined);
  const firstOrigin = origin(first);
  return firstOrigin !== undefined && firstOrigin === origin(second);
}
