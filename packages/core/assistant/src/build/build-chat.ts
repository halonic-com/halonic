// What every Build chat tool shares: the workspace, the review service, the
// trust check and what the model last read in this chat (HAL-3247).

import type { ReviewService } from "@halonicjs/app";
import type { DefinitionSource, Digest, ExpectedContent } from "@halonicjs/ports";
import { contentDigest } from "@halonicjs/std";

/** What the Build chat's tools need from the host, for one chat. */
export interface BuildToolsOptions {
  /** The chat the tools belong to: its cards are this chat's. */
  readonly chatId: string;
  /** The workspace's files as saved, changes to review included. */
  readonly files: DefinitionSource;
  /** Writes the assistant's changes as changes to review. */
  readonly review: Pick<ReviewService, "propose" | "proposeDelete">;
  /** Whether the workspace is trusted, read on every call. */
  readonly isTrusted: () => boolean;
  /** Hashes what the model read, for the check before a write. */
  readonly digest: Digest;
  /**
   * Shows an item to the person, next to the chat, for the `show` tool, and says how it went.
   * Absent: there is nowhere to show items, and `show` says so.
   */
  readonly show?: ((item: ItemToShow) => Promise<ShowOutcome>) | undefined;
}

/** An item the `show` tool shows, as the model names it. */
export interface ItemToShow {
  /** The item's kind, such as `run`, `agent` or `workflow`. */
  readonly kind: string;
  /** The hub it belongs to. */
  readonly hub: string;
  readonly id: string;
}

/**
 * How showing an item went: `shown` next to the chat, `unknown` because there is no such item, or
 * `nowhere` because this chat has nowhere to show it, such as on a phone.
 */
export type ShowOutcome = "shown" | "unknown" | "nowhere";

/**
 * The tools' shared state for one chat. It remembers the digest of each
 * file as the model last read or wrote it, so a write can check the file
 * is still what the model saw.
 */
export class BuildChat {
  readonly options: BuildToolsOptions;
  private readonly lastRead = new Map<string, ExpectedContent>();

  constructor(options: BuildToolsOptions) {
    this.options = options;
  }

  /** The file as the model last saw it in this chat; `undefined` if it never did. */
  seen(path: string): ExpectedContent | undefined {
    return this.lastRead.get(path);
  }

  /** Remembers `text` as what the model now knows of `path`; `null` for no file. */
  async see(path: string, text: string | null): Promise<void> {
    this.lastRead.set(
      path,
      text === null ? "absent" : await contentDigest(text, this.options.digest),
    );
  }
}

/**
 * Runs one store call, giving `"not-allowed"` for the `RangeError` the
 * `DefinitionSource` port throws for a path it won't serve, such as one
 * through a symbolic link. Any other error is thrown.
 */
export async function unlessRefused<T>(call: () => Promise<T>): Promise<T | "not-allowed"> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof RangeError) {
      return "not-allowed";
    }
    throw error;
  }
}

/**
 * The text argument `name` of a call.
 *
 * @throws Error when it is missing or not a text, which the model reads as "Error: …"
 */
export function textArgument(args: Record<string, unknown>, name: string): string {
  const value = args[name];
  if (typeof value !== "string") {
    throw new Error(`"${name}" must be a text.`);
  }
  return value;
}
