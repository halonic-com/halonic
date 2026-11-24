/**
 * The starting-context target: about how many tokens Claude Code's first
 * model call may carry before the task's own words (requirement
 * `harness-claude-code.starting-context`). Every later call repeats this
 * context, so it is paid on each one.
 */
export const startingContextTargetTokens = 20_000;

/**
 * Characters per token the estimate counts with. Prose runs at about four,
 * JSON schemas and code at fewer, so 3.5 errs on the side of more tokens.
 */
const charactersPerToken = 3.5;

/** How big one part of a recorded first call was. */
export interface RecordedTool {
  /** The tool's name, as Claude Code sent it. */
  readonly name: string;
  /** The characters of the tool's JSON definition. */
  readonly characters: number;
}

/**
 * The sizes of a recorded first model call. A recording keeps only sizes and
 * tool names, never the prompt's text.
 */
export interface FirstCallRecording {
  /** The characters of the JSON `system` field. */
  readonly systemCharacters: number;
  /** The characters of the JSON `messages` field, the prompt included. */
  readonly messagesCharacters: number;
  /** Each tool definition the call listed. */
  readonly tools: readonly RecordedTool[];
}

/** A pinned harness version's first calls, keyed by the `ENABLE_TOOL_SEARCH` value they ran with. */
export interface StartingContextRecording {
  /** The harness that was recorded. */
  readonly harness: "claude-code";
  /** The harness version that was recorded. */
  readonly version: string;
  /** The day it was recorded, `YYYY-MM-DD`. */
  readonly recordedOn: string;
  /** The first call for each `ENABLE_TOOL_SEARCH` value. */
  readonly firstCalls: Readonly<Record<string, FirstCallRecording>>;
}

/**
 * The estimated tokens of a recorded first call: system, messages and tool
 * definitions, at {@link charactersPerToken}.
 *
 * @example
 * estimatedStartingTokens({ systemCharacters: 35, messagesCharacters: 0, tools: [] }); // 10
 */
export function estimatedStartingTokens(call: FirstCallRecording): number {
  const toolCharacters = call.tools.reduce((sum, tool) => sum + tool.characters, 0);
  const characters = call.systemCharacters + call.messagesCharacters + toolCharacters;
  return Math.ceil(characters / charactersPerToken);
}
