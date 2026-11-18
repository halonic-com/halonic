import {
  EngineNotAnswering,
  type EngineWords,
  errorMessageFor,
  errorReasonFor,
  reasonAfterColon,
} from "@halonicjs/studio-shell";
import { ConnectorCouldntList, WorkspaceNotTrusted } from "./listed-tools-host.ts";
import { listedToolsWords } from "./listed-tools-words.ts";
import type { RefusalLinePart } from "./refusal-line.ts";

/** The "Couldn't list the tools" line, and what follows it. */
export interface LoadFailureLine {
  /** The line, in parts so a program's name can be set in code type. */
  readonly parts: readonly RefusalLinePart[];
  /** A command to run in a terminal, shown in a command box under the line. */
  readonly command?: string;
  /** **Review** opens the trust check, where trying again can't help; else **Try again**. */
  readonly button: "try-again" | "review";
  /** **Copy details** follows, when the line can't say all that went wrong. */
  readonly copyDetails: boolean;
}

/**
 * The line for tools that couldn't be listed (UX check C2, C3 and G2): a cause the agent host
 * names gets its own words, an engine that isn't answering gets the words for where Studio runs,
 * and anything else gives its kinded reason, or the sentence for a problem Halonic can't explain
 * with **Copy details**.
 *
 * @example
 * loadFailureLine(new ConnectorCouldntList({ reason: "stopped" }), "notes-mcp", words);
 * // { parts: [{ text: "Couldn't list the tools: notes-mcp stopped before it answered." }],
 * //   button: "try-again", copyDetails: true }
 */
export function loadFailureLine(
  error: unknown,
  sourceName: string,
  engine: EngineWords,
): LoadFailureLine {
  if (error instanceof ConnectorCouldntList) return causeLine(error, sourceName);
  if (error instanceof EngineNotAnswering) {
    return plainLine(listedToolsWords.loadFailed(reasonAfterColon(engine.notAnswering)), false);
  }
  const line = plainLine(listedToolsWords.loadFailed(reasonOf(error)), unexplained(error));
  return error instanceof WorkspaceNotTrusted ? { ...line, button: "review" } : line;
}

/** The words for a cause the agent host named. */
function causeLine({ failure }: ConnectorCouldntList, source: string): LoadFailureLine {
  const words = listedToolsWords.couldntList;
  switch (failure.reason) {
    case "program-missing":
      return {
        parts: words.programMissing(source, failure.program),
        button: "try-again",
        copyDetails: false,
      };
    case "secret-missing":
      return withSetSecret(words.secretMissing(source, failure.secret), failure.secret);
    case "secret-refused":
      return failure.secret === undefined
        ? plainLine(words.secretRefusedUnnamed(source), false)
        : withSetSecret(words.secretRefused(source, failure.secret), failure.secret);
    case "stopped":
      return plainLine(words.stopped(source), true);
    default:
      return failure satisfies never;
  }
}

function plainLine(text: string, copyDetails: boolean): LoadFailureLine {
  return { parts: [{ text }], button: "try-again", copyDetails };
}

function withSetSecret(text: string, secret: string): LoadFailureLine {
  return { ...plainLine(text, false), command: listedToolsWords.setSecret(secret) };
}

/** A failure with no reason of its own to show: its detail goes only to **Copy details**. */
function unexplained(error: unknown): boolean {
  return errorReasonFor(error, "") === "";
}

function reasonOf(error: unknown): string {
  return errorMessageFor(error, { title: "Couldn't list the tools" })
    .body.trim()
    .replace(/\.$/, "");
}
