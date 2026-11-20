import { CommandBox } from "@halonicjs/studio-kit";
import { pageWords } from "./page-words.ts";

/**
 * The strip under the workflow page's header that says how to start the workflow from a terminal.
 * Shows nothing without a command: on a Windows folder Studio has no command it can offer (D-A2).
 */
export function StartCommand({ command }: { readonly command: string | undefined }) {
  if (command === undefined) return null;
  return (
    <div
      data-testid="start-command"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-6 py-2 text-small text-fg-muted"
    >
      <p>{pageWords.startIt}</p>
      <CommandBox command={command} />
    </div>
  );
}
