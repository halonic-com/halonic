import { sandboxStartWords } from "@halonicjs/app";
import { cantRunWords, type SandboxStart } from "@halonicjs/studio-feature-runs/api";
import { Button, ExternalLink, RefreshIcon } from "@halonicjs/studio-kit";
import { type NotAvailableWords, notAvailableWords } from "./sandbox-state.ts";
import * as text from "./sandbox-text.ts";

/**
 * The words after the **Not available** chip (requirement `settings.agent-sandbox-not-available`,
 * microcopy 23.3). While the start check says why the sandbox can't start, {@link NotAvailableFix}
 * draws its reason and fix as it does for a failed host check, so both read and look the same.
 * Otherwise, before it answers and where nothing can check, 13.1's one line. **Check again** only
 * checks: it never changes a system setting.
 */
export function NotAvailableLines({
  start,
  announce,
}: {
  readonly start: SandboxStart;
  /** Says a result: the settings container's live region. */
  readonly announce: (line: string) => void;
}) {
  if (start.refused === undefined) return <p className="text-small">{text.NOT_AVAILABLE}</p>;
  const checkAgain = async () => {
    const outcome = await start.checkAgain();
    if (outcome.kind === "ready") announce(text.announceChecked("ready."));
    else if (outcome.kind === "refused")
      announce(cantRunWords.checkedRefused(sandboxStartWords(outcome.reason).reason));
    else announce(cantRunWords.checkFailed);
  };
  return (
    <NotAvailableFix
      words={notAvailableWords(start.refused, false)}
      note={start.checkFailed ? cantRunWords.checkFailed : undefined}
      checking={start.checking}
      onCheckAgain={() => void checkAgain()}
    />
  );
}

/**
 * A Not available state whose reason is known, whichever check found it (23.3, C701-1): the reason
 * on its own line, then the fix on its own line (none where the section's own set-up button is the
 * fix, 23.3a), then **Check again** in the section's own style with the guide beside it, then
 * "You can run an agent on this computer after a warning." in muted text.
 */
export function NotAvailableFix({
  words,
  note,
  checking,
  onCheckAgain,
}: {
  readonly words: NotAvailableWords;
  /** A line after the fix, such as a Check again that couldn't run. */
  readonly note?: string | undefined;
  /** A **Check again** is out. */
  readonly checking: boolean;
  readonly onCheckAgain: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 text-small">
      <p>{words.reason}</p>
      {words.fix === null ? null : <p>{words.fix}</p>}
      {note === undefined ? null : <p>{note}</p>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          variant="ghost"
          size="sm"
          icon={<RefreshIcon />}
          busy={checking}
          busyLabel={cantRunWords.checking}
          onClick={onCheckAgain}
        >
          {text.CHECK_AGAIN}
        </Button>
        <ExternalLink href={words.docs.href}>{words.docs.name}</ExternalLink>
      </div>
      <p className="text-fg-muted">{text.RUN_HERE_AFTER_WARNING}</p>
    </div>
  );
}
