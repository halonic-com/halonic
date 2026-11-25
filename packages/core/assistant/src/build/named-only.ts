// The gate every Build chat write with content passes
// (`assistant.build.named-hosts-secrets`, HAL-1309 test 2): a permission
// sheet or a connector file may ask only for the hosts and sign-ins the
// person named in their own messages. `BuildChat.propose` runs it, so a
// fresh file, an edit and a copy onto a sheet's path meet it alike.
//
// "Named" means only that the host or sign-in is in the person's messages,
// pasted text included. It isn't proof they meant it: the proposal card
// they review and the trust check before an integration runs (I5) stay
// the real gate. This one keeps out a host that only came from a tool
// result, a fetched page or the model's own idea.

import { type FileProblem, parseFile } from "@halonicjs/format";
import { segmentAsOpened } from "@halonicjs/ports";
import {
  type AskedHost,
  type Asks,
  connectorAsks,
  nothingAsked,
  sheetAsks,
  unreadableUrl,
} from "./asked-hosts.ts";
import { isNamed, namedIn } from "./named-hosts.ts";
import { toolTexts } from "./tool-texts.ts";

/** The kinds of file the gate reads. */
type GatedKind = "integration" | "connector";

/**
 * Why the Build chat may not write `content` to `path`, in words the model
 * can act on, or `null` when it may. Only a permission sheet
 * (`integration.yaml`) and a connector file (`*.connector.yaml`) are
 * checked, however the path spells their names. Each must parse, and what
 * it asks for beyond what the file at `path` asks for now must be named:
 * each host exactly, no OAuth sign-in, and no more new secrets than the
 * sign-ins the person named.
 *
 * @param current - the file at `path` now, `null` when there is none
 * @param messages - the person's own messages in this chat
 *
 * @example
 * namedOnlyRefusal(sheetPath, sheetWithOtherHost, null, ["Notes at api.notes.example.com"]);
 * // "Couldn't change integrations/notes/integration.yaml: other.example.com isn't …"
 */
export function namedOnlyRefusal(
  path: string,
  content: string,
  current: string | null,
  messages: readonly string[],
): string | null {
  const kind = gatedKind(path);
  if (kind === undefined) return null;
  const asks = asksOf(kind, content);
  if (asks === unreadableUrl) return toolTexts.unreadableUrl(path);
  if (isProblems(asks)) return toolTexts.doesNotParse(path, firstProblem(asks));
  // A file that is missing, doesn't parse or has a URL that can't be read keeps nothing.
  const before = current === null ? nothingAsked : asksOf(kind, current);
  const kept = before === unreadableUrl || isProblems(before) ? nothingAsked : before;
  const named = namedIn(messages);

  const hosts = asks.hosts.filter(
    (host) => !kept.hosts.some((old) => sameHost(old, host)) && !isNamed(named, host),
  );
  if (hosts.length > 0) {
    return toolTexts.hostsNotNamed(path, [...new Set(hosts.map(hostText))]);
  }
  if (asks.oauth.some((name) => !kept.oauth.includes(name))) {
    return toolTexts.oauthNotNamed(path);
  }
  const secrets = asks.secrets.filter((name) => !kept.secrets.includes(name));
  if (secrets.length > named.signIns.size) {
    return toolTexts.secretsNotNamed(path, secrets.length, named.signIns.size);
  }
  return null;
}

/** Whether the gate reads a file written to `path`: a permission sheet or a connector file. */
export function isGatedPath(path: string): boolean {
  return gatedKind(path) !== undefined;
}

/** The gated kind of `path` by its file name, compared as a file system would open it. */
function gatedKind(path: string): GatedKind | undefined {
  const name = segmentAsOpened(path.split("/").at(-1) ?? "");
  if (name === "integration.yaml") return "integration";
  return name.endsWith(".connector.yaml") ? "connector" : undefined;
}

/** What `text` asks for as a file of `kind`, or why it doesn't parse. */
function asksOf(
  kind: GatedKind,
  text: string,
): Asks | typeof unreadableUrl | readonly FileProblem[] {
  if (kind === "integration") {
    const parsed = parseFile("integration", text);
    return parsed.ok ? sheetAsks(parsed.value.value) : parsed.error;
  }
  const parsed = parseFile("connector", text);
  return parsed.ok ? connectorAsks(parsed.value.value) : parsed.error;
}

function isProblems(value: Asks | readonly FileProblem[]): value is readonly FileProblem[] {
  return Array.isArray(value);
}

/** Whether two hosts are written alike, case aside, so an edit keeps the hosts a file has. */
function sameHost(a: AskedHost, b: AskedHost): boolean {
  return hostText(a) === hostText(b) && a.scheme.toLowerCase() === b.scheme.toLowerCase();
}

function hostText(host: AskedHost): string {
  return (host.port === undefined ? host.name : `${host.name}:${host.port}`).toLowerCase();
}

function firstProblem(problems: readonly FileProblem[]): string {
  const [first] = problems;
  return first === undefined ? "it isn't valid" : `line ${first.line}: ${first.message}`;
}
