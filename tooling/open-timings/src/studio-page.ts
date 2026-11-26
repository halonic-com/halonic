/**
 * Prepares the installed Studio to reopen a workspace at its next start, through WebView2's
 * DevTools port, as a person's last session would have left it (HAL-19600): the workspace in
 * Recent and as what Studio's window showed. The app carries no test-only code for this.
 */

/** The page's storage key for Recent (`RecentWorkspaces` in the workspace feature). */
const RECENT_KEY = "halonic.workspace.recent";

/** A page DevTools lists on its port. */
export interface ListedPage {
  readonly type: string;
  readonly url: string;
  readonly webSocketDebuggerUrl: string;
}

/** How {@link studioPage} reads the port's list, waits and tells the time; real ones by default. */
export interface Polling {
  list(port: number): Promise<readonly ListedPage[]>;
  wait(ms: number): Promise<void>;
  now(): number;
}

const realPolling: Polling = {
  list: async (port) =>
    (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as ListedPage[],
  wait: (ms) => new Promise((done) => setTimeout(done, ms)),
  now: () => Date.now(),
};

/** The DevTools address of the Studio page on `port`, once WebView2 lists it, within `seconds`. */
export async function studioPage(
  port: number,
  seconds: number,
  polling: Polling = realPolling,
): Promise<string> {
  const deadline = polling.now() + seconds * 1000;
  let seen = "nothing listened";
  while (polling.now() < deadline) {
    try {
      const pages = await polling.list(port);
      const page = pages.find(
        (entry) => entry.type === "page" && entry.url.includes("studio.html"),
      );
      if (page !== undefined) return page.webSocketDebuggerUrl;
      seen = JSON.stringify(pages.map((entry) => entry.url));
    } catch (error) {
      // Not listening yet: Studio is still starting.
      seen = String(error);
    }
    await polling.wait(1000);
  }
  throw new Error(`no Studio page on DevTools port ${port} (last seen: ${seen})`);
}

/** The page script that puts `location` in Recent and keeps it as what Studio's window shows. */
export function rememberScript(location: string, name: string): string {
  const recent = JSON.stringify([{ location, name }]);
  const content = JSON.stringify({ workspace: location });
  return `(async () => {
    const until = Date.now() + 30000;
    while (!window.__TAURI_INTERNALS__?.invoke && Date.now() < until) {
      await new Promise((done) => setTimeout(done, 200));
    }
    localStorage.setItem(${JSON.stringify(RECENT_KEY)}, ${JSON.stringify(recent)});
    await window.__TAURI_INTERNALS__.invoke("window_content_set", { content: ${JSON.stringify(content)} });
    return "remembered";
  })()`;
}

/** The parts of a WebSocket {@link evaluate} uses. */
export interface PageSocket {
  addEventListener(
    type: "open" | "error" | "message",
    listener: (event: { data?: unknown }) => void,
  ): void;
  send(data: string): void;
  close(): void;
}

interface EvaluateAnswer {
  readonly result?: {
    readonly result?: { readonly value?: unknown };
    readonly exceptionDetails?: unknown;
  };
}

/** Runs `expression` in the page at `address` and answers its value; throws what the page threw. */
export async function evaluate(
  address: string,
  expression: string,
  open: (address: string) => PageSocket = (at) => new WebSocket(at),
): Promise<unknown> {
  const socket = open(address);
  const answer = new Promise<EvaluateAnswer>((answered, failed) => {
    socket.addEventListener("error", () => failed(new Error(`can't reach ${address}`)));
    socket.addEventListener("message", (event) =>
      answered(JSON.parse(String(event.data)) as EvaluateAnswer),
    );
    socket.addEventListener("open", () => {
      const params = { expression, awaitPromise: true, returnByValue: true };
      socket.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params }));
    });
  });
  try {
    const { result } = await answer;
    if (result?.exceptionDetails !== undefined) {
      throw new Error(`the page refused: ${JSON.stringify(result.exceptionDetails)}`);
    }
    return result?.result?.value;
  } finally {
    socket.close();
  }
}
