import { matchesRequest, type PaperclipRequestName } from "./requests.ts";
import { PaperclipClientError } from "./transport.ts";

/**
 * The short shadow list (threat model rev 2, G1): the only rows the shadow reader may send, all of
 * them GETs on the fixed request list. Nothing here can approve, comment or write a document.
 */
export const shadowRequestNames = [
  "listApprovals",
  "getApproval",
  "listApprovalTasks",
  "listApprovalComments",
  "listCompanyActivity",
  "readNeverList",
  "listNeverListRevisions",
  "readStopDocument",
  "listStopDocumentRevisions",
] as const satisfies readonly PaperclipRequestName[];

/** One row of {@link shadowRequestNames}. */
export type ShadowRequestName = (typeof shadowRequestNames)[number];

/** What the shadow reader's own transport did, for the daily digest (G4). */
export interface ShadowCallCounts {
  /** Requests that went to Paperclip, every one a GET on the shadow list. */
  readonly sent: number;
  /** Attempts refused before anything was sent. Must stay 0. */
  readonly refused: number;
  /** Of those, the attempts with a method other than GET. Must stay 0. */
  readonly refusedNotGet: number;
}

/** Whether `name` is a row of the shadow list; anything else, the type checker aside, is not. */
export function isShadowRequest(name: string): name is ShadowRequestName {
  return (shadowRequestNames as readonly string[]).includes(name);
}

/**
 * Counts the shadow reader's calls, and refuses before sending. The reader checks a row's name;
 * {@link guardFetch} checks again right at the network, below every other layer.
 */
export class ShadowCallCounter {
  #sent = 0;
  #refused = 0;
  #refusedNotGet = 0;

  /** The counts so far. */
  counts(): ShadowCallCounts {
    return { sent: this.#sent, refused: this.#refused, refusedNotGet: this.#refusedNotGet };
  }

  /** Counts one refused attempt and gives the error to throw; nothing was sent. */
  refuse(method: string, what: string): PaperclipClientError {
    this.#refused += 1;
    if (method !== "GET") this.#refusedNotGet += 1;
    return new PaperclipClientError(`The shadow reader never sends ${what}.`, "refused");
  }

  /**
   * A `fetch` that hands `inner` only a GET without a body whose path is a shadow row's, and
   * refuses anything else before `inner` is called (G1).
   */
  guardFetch(inner: typeof fetch): typeof fetch {
    return (input, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      const path = input instanceof URL ? input.pathname : undefined;
      const onList =
        path !== undefined && shadowRequestNames.some((name) => matchesRequest(name, method, path));
      if (method !== "GET" || init?.body != null || !onList) {
        return Promise.reject(this.refuse(method, `${method} to that address`));
      }
      this.#sent += 1;
      return inner(input, init);
    };
  }
}
