import {
  type ItemRef,
  type OpenItemOptions,
  type ServiceKey,
  serviceKey,
} from "@halonicjs/studio-shell";

/**
 * A page `ModelsService` asks the window to open: one of the feature's items, or, when there is
 * no item to open, the command that opens the workspace page's Models.
 */
export type PageRequest =
  | { readonly open: "item"; readonly item: ItemRef; readonly options?: OpenItemOptions }
  | { readonly open: "command"; readonly commandId: string };

/**
 * The pages asked for and not yet opened, for one open folder. Services are built per folder and
 * have no window, so `ModelsService` asks here and the window's page opener (`PageOpenerHost`)
 * opens each page with the window's own `openItem`.
 */
export class PageRequests {
  #waiting: PageRequest[] = [];
  readonly #listeners = new Set<() => void>();

  /** The requests not yet opened, oldest first. The same array until one is added or taken. */
  readonly waiting = (): readonly PageRequest[] => this.#waiting;

  /** Calls `listener` each time a request is added or taken; returns the way to stop. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  /** Asks for a page to open. */
  add(request: PageRequest): void {
    this.#waiting = [...this.#waiting, request];
    this.#notify();
  }

  /** Takes every waiting request, oldest first, so each opens once. */
  take(): readonly PageRequest[] {
    const taken = this.#waiting;
    if (taken.length === 0) return taken;
    this.#waiting = [];
    this.#notify();
    return taken;
  }

  #notify(): void {
    for (const listener of this.#listeners) listener();
  }
}

/** The open folder's page requests, for the feature's own page opener. */
export const PageRequestsService: ServiceKey<PageRequests> =
  serviceKey<PageRequests>("models.page-requests");
