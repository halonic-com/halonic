import type { TauriIpc } from "@halonicjs/studio-services";

/**
 * What an app window showed, kept by the shell per window so Halonic reopens it there
 * (`studio.window-content`): only ids and paths the page checks again when it reads them back,
 * never a secret or a file's text.
 */
export interface WindowContent {
  /** The location of the workspace the window showed, as in Recent. */
  readonly workspace?: string;
  /** The Messenger's open chat, by id. */
  readonly chat?: string;
  /** The Inbox's open item, by key. */
  readonly item?: string;
}

/** The most the shell keeps for one window (`studio.src-tauri.open-windows`); more is refused. */
export const maxWindowContentBytes = 2_048;

const fields = ["workspace", "chat", "item"] as const;

/**
 * Reads what the shell kept for the page's window. The shell never checks it, so it is read as
 * untrusted: content that isn't a string, is over {@link maxWindowContentBytes}, isn't JSON, or
 * has another shape or a field of another type reads as nothing. A refusal also reads as nothing,
 * and the console says why.
 */
export async function readWindowContent(ipc: TauriIpc): Promise<WindowContent> {
  try {
    return parseWindowContent(await ipc.invoke("window_content_get"));
  } catch (error) {
    console.error("Halonic couldn't read what this window showed:", error);
    return {};
  }
}

/** The content in `raw`, as {@link readWindowContent} reads it; `{}` when it is anything else. */
export function parseWindowContent(raw: unknown): WindowContent {
  if (typeof raw !== "string" || byteLength(raw) > maxWindowContentBytes) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Not JSON: nothing was kept that this page can use, which is what "nothing" means here.
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  const content: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!(fields as readonly string[]).includes(key) || typeof value !== "string") return {};
    if (value !== "") content[key] = value;
  }
  return content;
}

/**
 * Keeps what the page's window shows through the shell's `window_content_set`, one call at a
 * time: each call is awaited before the next starts, so the last content kept is the last one
 * given. Content the same as the last kept isn't sent again. Content over
 * {@link maxWindowContentBytes} is never cut short: the window keeps nothing instead, so it
 * reopens on its start screen. A refusal goes to the console.
 *
 * @example
 * const keeper = new WindowContentKeeper(ipc);
 * await keeper.keep({ workspace: "/work/acme" });
 */
export class WindowContentKeeper {
  readonly #ipc: TauriIpc;
  #writing: Promise<void> = Promise.resolve();
  #last: string | null | undefined;

  constructor(ipc: TauriIpc) {
    this.#ipc = ipc;
  }

  /** Keeps `content` for the window; resolves once the shell has it, or has refused it. */
  keep(content: WindowContent): Promise<void> {
    this.#writing = this.#writing.then(() => this.#write(content));
    return this.#writing;
  }

  async #write(content: WindowContent): Promise<void> {
    const text = serialised(content);
    if (text === this.#last) return;
    try {
      await this.#ipc.invoke("window_content_set", { content: text });
      this.#last = text;
    } catch (error) {
      console.error("Halonic couldn't keep what this window shows:", error);
    }
  }
}

/** `content` as the shell keeps it: JSON, or `null` for nothing or for content over the limit. */
function serialised(content: WindowContent): string | null {
  const kept = Object.fromEntries(
    fields.flatMap((field) => {
      const value = content[field];
      return value === undefined || value === "" ? [] : [[field, value]];
    }),
  );
  if (Object.keys(kept).length === 0) return null;
  const text = JSON.stringify(kept);
  if (byteLength(text) <= maxWindowContentBytes) return text;
  console.error(`What this window shows is over ${maxWindowContentBytes} bytes; it keeps nothing.`);
  return null;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
