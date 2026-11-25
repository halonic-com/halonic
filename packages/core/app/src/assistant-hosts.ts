// The hosts the assistant added to a local integration's permission sheet
// that the person didn't name (HAL-525): the trust screen and the CLI trust
// check mark them "added by the assistant". They are recorded when the
// person accepts the assistant's change, in one file next to the review
// records, in the workspace's review folder in the profile. So a workspace
// file can neither set a mark nor take one away, and git can't bring one in.
//
// "Named" means named in the person's own messages in the chat that wrote
// the change, as the Build chat's gate reads them (`namedIn`). A host the
// sheet already had before the change is never marked by it.
//
// A mark shows while its host is in the sheet, and the next accepted change
// to that sheet drops the marks of hosts it no longer has. A host the person
// later types into the file by hand keeps its mark: the two can't be told
// apart.

import { parseFile } from "@halonicjs/format";
import type { DefinitionStore } from "@halonicjs/ports";

/** The file in the review folder that holds the marks; a review record is never named like it. */
export const assistantHostsFile = "assistant-hosts.json";

/** The marks, by integration folder, such as `integrations/notes`, then host. */
export type AssistantAddedHosts = ReadonlyMap<string, ReadonlySet<string>>;

/**
 * Which hosts the person named in one chat, for a host as a sheet writes it,
 * such as `api.example.com` or `api.example.com:8443`.
 */
export type HostsNamedIn = (chatId: string) => Promise<(host: string) => boolean>;

/** A change to one file the person accepted: the file before and after it. */
export interface AcceptedText {
  readonly path: string;
  /** The file before the change, `null` for a file the change created. */
  readonly before: string | null;
  /** The file with the change, `null` for a file the change deleted. */
  readonly after: string | null;
  /** Whether the person named a host in the chat that wrote the change. */
  readonly named: (host: string) => boolean;
}

const format = 1;

/**
 * The assistant-added hosts of one workspace.
 *
 * @example
 * const hosts = new AssistantHosts(new FolderDefinitionStore(folders.reviewFolder()));
 * await hosts.accepted({ path: "integrations/notes/integration.yaml", before, after, named });
 * (await hosts.read()).get("integrations/notes"); // Set { "api.example.com" }
 */
export class AssistantHosts {
  private readonly store: DefinitionStore;
  /** Every change runs after the one before, so two Accepts can't lose each other's marks. */
  private queue: Promise<unknown> = Promise.resolve();

  /** @param store - the review records' store, rooted at the workspace's review folder in the profile */
  constructor(store: DefinitionStore) {
    this.store = store;
  }

  /** The marks as recorded. A file that can't be read counts as no marks. */
  async read(): Promise<AssistantAddedHosts> {
    return parseMarks(await this.store.read(assistantHostsFile));
  }

  /**
   * Records the hosts an accepted change added to a local integration's
   * sheet that the person didn't name, and drops the marks of hosts the
   * sheet no longer has. Any other file changes nothing.
   */
  accepted(change: AcceptedText): Promise<void> {
    const folder = integrationFolderOf(change.path);
    if (folder === undefined) {
      return Promise.resolve();
    }
    const next = this.queue.then(() => this.mark(folder, change));
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async mark(folder: string, change: AcceptedText): Promise<void> {
    const after = sheetHosts(change.after);
    const before = new Set(sheetHosts(change.before));
    const marks = new Map(await this.read());
    const kept = [...(marks.get(folder) ?? [])].filter((host) => after.includes(host));
    const added = after.filter((host) => !before.has(host) && !change.named(host));
    const hosts = new Set([...kept, ...added]);
    if (hosts.size === 0) {
      if (!marks.delete(folder)) return;
    } else {
      marks.set(folder, hosts);
    }
    await this.store.write(assistantHostsFile, serializeMarks(marks));
  }
}

/**
 * The hosts of one integration that show "added by the assistant": the ones
 * recorded for its folder that its sheet still has. So removing a host from
 * the sheet removes its mark, without writing to the record.
 *
 * @param hosts - the sheet's hosts now, such as the keys of the trust content's `hosts`
 */
export function assistantAddedIn(
  marks: AssistantAddedHosts,
  folder: string,
  hosts: Iterable<string>,
): ReadonlySet<string> {
  const recorded = marks.get(folder) ?? new Set();
  return new Set([...hosts].filter((host) => recorded.has(host)));
}

/**
 * The integration folder of a local integration's sheet, such as
 * `integrations/notes` for `integrations/notes/integration.yaml`.
 */
function integrationFolderOf(path: string): string | undefined {
  return /^(integrations\/[^/]+)\/integration\.yaml$/u.exec(path)?.[1];
}

/** The fixed hosts of a sheet; none for no sheet or one that doesn't parse. */
function sheetHosts(text: string | null): string[] {
  if (text === null) return [];
  const parsed = parseFile("integration", text);
  if (!parsed.ok) return [];
  return parsed.value.value.hosts.filter((host) => typeof host === "string");
}

function parseMarks(text: string | null): AssistantAddedHosts {
  const marks = new Map<string, ReadonlySet<string>>();
  if (text === null) return marks;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return marks;
  }
  if (!isObject(value) || value["format"] !== format) return marks;
  const integrations = value["integrations"];
  if (!isObject(integrations)) return marks;
  for (const [folder, hosts] of Object.entries(integrations)) {
    if (Array.isArray(hosts) && hosts.every((host) => typeof host === "string")) {
      marks.set(folder, new Set(hosts));
    }
  }
  return marks;
}

function serializeMarks(marks: AssistantAddedHosts): string {
  const integrations = Object.fromEntries(
    [...marks]
      .sort(([one], [other]) => (one < other ? -1 : 1))
      .map(([folder, hosts]) => [folder, [...hosts].sort()]),
  );
  return `${JSON.stringify({ format, integrations }, null, 2)}\n`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
