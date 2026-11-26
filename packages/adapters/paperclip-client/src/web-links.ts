// Each inbox item's page in the Paperclip web app (requirement `paperclip-client.web-link`),
// so a person can open it there while a card can't be answered in Halonic.
import type { InboxItem, InboxWebLink } from "@halonicjs/ports";
import { checkedOrigin } from "./address.ts";
import { type JsonRecord, text } from "./json.ts";

/** The name Studio shows in the link, as "Open in Paperclip". */
const paperclipSite = "Paperclip";

/** A task identifier, such as `ACME-7`: the company's prefix, a dash and a number. */
const taskIdentifier = /^([A-Za-z0-9]+)-\d+$/;

/**
 * Builds web links on the connection's origin. A connection that isn't `https`, such as plain
 * `http` to this computer, gets none: the port only holds `https` links.
 */
export class PaperclipWebLinks {
  readonly #origin: string | undefined;

  /** `address` is the connection's, already checked by the transport. */
  constructor(address: string) {
    const origin = checkedOrigin(address);
    this.#origin = origin.startsWith("https://") ? origin : undefined;
  }

  /** The page of the task with identifier `identifier`, such as `ACME-7`. */
  task(identifier: string | undefined): InboxWebLink | undefined {
    const prefix = prefixOf(identifier);
    return identifier === undefined || prefix === undefined
      ? undefined
      : this.#link([prefix, "issues", identifier]);
  }

  /** The page of approval `approval` in the company whose tasks start with `prefix`. */
  approval(prefix: string | undefined, approval: string): InboxWebLink | undefined {
    return prefix === undefined ? undefined : this.#link([prefix, "approvals", approval]);
  }

  #link(segments: readonly string[]): InboxWebLink | undefined {
    if (this.#origin === undefined) {
      return undefined;
    }
    // Each segment is encoded, so a `/`, `?` or `#` in an ID can't change where the link goes.
    const path = segments.map((segment) => encodeURIComponent(segment)).join("/");
    return { link: new URL(`/${path}`, this.#origin).href, site: paperclipSite };
  }
}

/** The company prefix of a task identifier, such as `ACME` for `ACME-7`. */
export function prefixOf(identifier: string | undefined): string | undefined {
  return identifier === undefined ? undefined : taskIdentifier.exec(identifier)?.[1];
}

/** The company prefix, read from the first of `tasks` with an identifier. */
export function companyPrefix(tasks: readonly JsonRecord[]): string | undefined {
  for (const task of tasks) {
    const prefix = prefixOf(text(task, "identifier"));
    if (prefix !== undefined) {
      return prefix;
    }
  }
  return undefined;
}

/** `item` with `webLink`, or as it is when there is none. */
export function withWebLink(item: InboxItem, webLink: InboxWebLink | undefined): InboxItem {
  return webLink === undefined ? item : { ...item, webLink };
}
