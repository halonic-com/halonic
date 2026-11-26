import type { ShadowCallCounts } from "@halonicjs/auto-approvals";
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

export type { ShadowCallCounts };

/** One row of {@link shadowRequestNames}. */
export type ShadowRequestName = (typeof shadowRequestNames)[number];

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
  #writesSent = 0;
  #serverTime: Date | undefined;

  /** The counts so far. */
  counts(): ShadowCallCounts {
    return {
      sent: this.#sent,
      refused: this.#refused,
      refusedNotGet: this.#refusedNotGet,
      writesSent: this.#writesSent,
    };
  }

  /**
   * The server's time from the newest answer's `Date` header, or `undefined` when that answer had
   * none or one that doesn't parse. The runner judges the never-list's 24 hours by it.
   */
  serverTime(): Date | undefined {
    return this.#serverTime;
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
    const network = this.#countWrites(inner);
    return (input, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      const path = input instanceof URL ? input.pathname : undefined;
      const onList =
        path !== undefined && shadowRequestNames.some((name) => matchesRequest(name, method, path));
      if (method !== "GET" || init?.body != null || !onList) {
        return Promise.reject(this.refuse(method, `${method} to that address`));
      }
      this.#sent += 1;
      this.#serverTime = undefined;
      return network(input, init).then((response) => {
        const date = new Date(response.headers.get("date") ?? "");
        this.#serverTime = Number.isNaN(date.getTime()) ? undefined : date;
        return response;
      });
    };
  }

  /**
   * `inner`, counting every request other than GET that reaches it. It sits below the guard, so
   * the digest's "writes sent" is a measurement that must stay 0, not a promise (G4).
   */
  #countWrites(inner: typeof fetch): typeof fetch {
    return (input, init) => {
      if ((init?.method ?? "GET").toUpperCase() !== "GET") this.#writesSent += 1;
      return inner(input, init);
    };
  }
}
