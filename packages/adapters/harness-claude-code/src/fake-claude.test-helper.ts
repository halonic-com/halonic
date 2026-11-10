import type { FakeProgram } from "@halonicjs/testing-contracts";
import type { SettingsFolderWriter } from "./settings.ts";

/** A settings folder in memory, by path, for runs whose settings folder isn't on this computer's disk. */
export class MemorySettingsFolder implements SettingsFolderWriter {
  readonly files = new Map<string, string>();

  async read(path: string): Promise<string | null> {
    return this.files.get(path) ?? null;
  }

  async write(path: string, text: string): Promise<void> {
    this.files.set(path, text);
  }
}

/** Claude Code's `result` line for a run that ended well with `text`. */
export function successLine(text: string): string {
  return JSON.stringify({ type: "result", subtype: "success", is_error: false, result: text });
}

/** An assistant message with one text block, as Claude Code prints it. */
export function assistantLine(text: string): string {
  const message = { role: "assistant", content: [{ type: "text", text }] };
  return JSON.stringify({ type: "assistant", message, parent_tool_use_id: null });
}

/** The text of a `stream-json` user message Claude Code read on its standard input. */
export function userMessageText(line: string | null): string | undefined {
  if (line === null) return undefined;
  const parsed = JSON.parse(line) as { type: string; message: { content: string } };
  return parsed.type === "user" ? parsed.message.content : undefined;
}

/**
 * Claude Code doing its task, as `claude -p --input-format stream-json`
 * does: it reads the prompt, prints `lines`, then waits for its input to end
 * before it exits.
 */
export function claudeAnswering(lines: readonly string[]): FakeProgram {
  return async (io) => {
    await io.readLine();
    for (const line of lines) io.write(`${line}\n`);
    while ((await io.readLine()) !== null) {
      // Claude Code reads further messages until its input ends.
    }
    return 0;
  };
}

/** Claude Code finishing with "Teal." */
export const claudeFinishing: FakeProgram = claudeAnswering([
  JSON.stringify({ type: "system", subtype: "init", claude_code_version: "2.1.321" }),
  assistantLine("Teal."),
  successLine("Teal."),
]);

/** Claude Code failing before its result: it reads the prompt, prints `message` to standard error and exits with 1. */
export function claudeFailing(message: string): FakeProgram {
  return async (io) => {
    await io.readLine();
    io.writeError(`${message}\n`);
    return 1;
  };
}
