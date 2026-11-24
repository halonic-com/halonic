import type { Issue } from "@halonicjs/schema-kit";
import type { Result } from "@halonicjs/std";
import type { FileKind, KindCheckProblem } from "../../kind.ts";
import { isLoopback, parseUrlHost } from "../../kinds/integration/url-host.ts";
import { type FileProblem, type ParsedFile, parseWithKind } from "../../parse-file.ts";
import { PaperclipConnection } from "./schema.ts";

/**
 * The rules of a Paperclip connection file. It isn't in the kind registry:
 * Studio shows a connection as a read-only hub of proxy items, not as a
 * definition the loader runs, and the workspace reads the folder on its own
 * (`readPaperclipConnections` in `@halonicjs/workspace`).
 */
const paperclipConnectionKind: FileKind<PaperclipConnection> = {
  name: "paperclipConnection",
  about: "A Paperclip server and company the workspace reads live, without its key or data.",
  syntax: "yaml",
  schema: PaperclipConnection,
  places: [],
  idFromPlace: "none",
  wordIssues: wordKeyFields,
  check: (connection) => checkAddress(connection.address),
};

/**
 * Reads and checks one `connections/paperclip/<name>.yaml`.
 *
 * @param text - the whole file
 * @returns the connection, or every problem with its line and column
 *
 * @example
 * const parsed = parsePaperclipConnection(text);
 * if (!parsed.ok) for (const problem of parsed.error) report(problem.line, problem.message);
 */
export function parsePaperclipConnection(
  text: string,
): Result<ParsedFile<PaperclipConnection>, FileProblem[]> {
  return parseWithKind(paperclipConnectionKind, text);
}

/**
 * What makes two connections the same: the server, as `URL` would write its
 * scheme, host and port, with its path and without a trailing `/`, and the
 * company. Two files with the same key would show every item twice.
 *
 * @example
 * paperclipConnectionKey({ label: "A", address: "https://Paperclip.example.com:443/", company: "c1" });
 * // "https://paperclip.example.com c1"
 */
export function paperclipConnectionKey(connection: PaperclipConnection): string {
  const found = parseUrlHost(connection.address);
  if (found === undefined) {
    return `${connection.address} ${connection.company}`;
  }
  const scheme = found.plain ? "http" : "https";
  const path = connection.address.replace(/^[^:]*:\/\/[^/]*/u, "").replace(/\/+$/u, "");
  return `${scheme}://${found.host}${path} ${connection.company}`;
}

/** Field names that say they hold a credential, such as `key`, `apiKey` or `token`. */
const credentialName = /key|token|secret|passw(?:or)?d|credential|auth/iu;

/**
 * A key, token or secret written into the file gets words that say where it
 * goes instead: the keychain. Any other unknown field keeps the shared wording.
 */
function wordKeyFields(issues: readonly Issue[]): Issue[] {
  return issues.map((issue) => {
    const credentials = (issue.keys ?? []).filter((key) => credentialName.test(key));
    if (issue.code !== "unrecognized_keys" || credentials.length === 0) {
      return issue;
    }
    const fields = credentials.map((key) => `"${key}"`).join(", ");
    return {
      ...issue,
      message: `A connection file holds only label, address and company, so ${fields} can't be in it: Paperclip keys live in the keychain, never in the workspace. Remove the line.`,
    };
  });
}

/**
 * The key is sent to this address, so it must be `https://`, or `http://`
 * to this machine only, where nothing travels over a network. A user name,
 * password, query or fragment in it is refused: the address names a server.
 */
function checkAddress(address: string): KindCheckProblem[] {
  const found = /[?#]/u.test(address) ? undefined : parseUrlHost(address);
  if (found === undefined) {
    return [
      addressProblem(
        "Write the server's address as https:// and its host, such as https://paperclip.example.com, without a user name, password, query or fragment.",
      ),
    ];
  }
  if (found.plain && !isLoopback(found.hostname)) {
    return [
      addressProblem(
        `Use https:// for ${found.host}: http:// is only for a server on this computer (localhost or 127.0.0.1), because the key would travel unencrypted.`,
      ),
    ];
  }
  return [];
}

function addressProblem(message: string): KindCheckProblem {
  return { severity: "error", code: "paperclip-address", path: ["address"], message };
}
