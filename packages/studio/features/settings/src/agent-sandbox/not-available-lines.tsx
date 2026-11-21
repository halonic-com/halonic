import { sandboxStartWords } from "@halonicjs/app";
import { cantRunWords, type SandboxStart } from "@halonicjs/studio-feature-runs/api";
import { Button, ExternalLink } from "@halonicjs/studio-kit";
import * as text from "./sandbox-text.ts";

/**
 * The words after the **Not available** chip (requirement `settings.agent-sandbox-not-available`,
 * microcopy 23.3). While the start check says why the sandbox can't start: the reason, the fix
 * (none where the section's own set-up button is the fix, 23.3a), then **Check again** and the
 * guide, then "You can run an agent on this computer after a warning." The reason, the fix and the
 * guide's name are the ones a failed host check shows here too, so both read the same.
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
  const words = sandboxStartWords(start.refused);
  const checkAgain = async () => {
    const outcome = await start.checkAgain();
    if (outcome.kind === "ready") announce(text.announceChecked("ready."));
    else if (outcome.kind === "refused")
      announce(cantRunWords.checkedRefused(sandboxStartWords(outcome.reason).reason));
    else announce(cantRunWords.checkFailed);
  };
  return (
    <div className="flex flex-col gap-2 text-small">
      <p>{words.reason}</p>
      {words.settingsFix === null ? null : <p>{words.settingsFix}</p>}
      {start.checkFailed ? <p>{cantRunWords.checkFailed}</p> : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          variant="secondary"
          size="sm"
          busy={start.checking}
          busyLabel={cantRunWords.checking}
          onClick={() => void checkAgain()}
        >
          {text.CHECK_AGAIN}
        </Button>
        <ExternalLink href={`${text.DOCS_ADDRESS}/${words.docsKey}`}>{words.docsName}</ExternalLink>
      </div>
      <p>{text.RUN_HERE_AFTER_WARNING}</p>
    </div>
  );
}
