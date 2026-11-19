import { sandboxStartWords } from "@halonicjs/app";
import type { SandboxStart } from "@halonicjs/studio-feature-runs/api";
import { Button, ExternalLink } from "@halonicjs/studio-kit";
import * as text from "./sandbox-text.ts";

/**
 * The reasons whose fix is "open Settings and set up the sandbox there". In Settings that line is
 * left out: the person is already there (microcopy 23.3a).
 */
const fixedInSettings: ReadonlySet<string> = new Set([
  "windows",
  "distro-missing",
  "setup-conflict",
  "setup-needed",
]);

/**
 * The words after the **Not available** chip (requirement `settings.agent-sandbox-not-available`,
 * microcopy 23.3). While the start check says why the sandbox can't start: the reason, the fix, then
 * **Check again** and the guide, then "You can run an agent on this computer after a warning."
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
  const code = words.key.slice("sandbox-start.".length);
  const checkAgain = async () => {
    const outcome = await start.checkAgain();
    if (outcome.kind === "ready") announce(text.announceChecked("ready."));
    else if (outcome.kind === "refused")
      announce(text.announceChecked(`not ready. ${sandboxStartWords(outcome.reason).reason}`));
    else announce(text.CHECK_FAILED);
  };
  return (
    <div className="flex flex-col gap-2 text-small">
      <p>{words.reason}</p>
      {fixedInSettings.has(code) ? null : <p>{words.calloutFix}</p>}
      {start.checkFailed ? <p>{text.CHECK_FAILED}</p> : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          variant="secondary"
          size="sm"
          busy={start.checking}
          busyLabel={text.CHECKING_BUSY}
          onClick={() => void checkAgain()}
        >
          {text.CHECK_AGAIN}
        </Button>
        <ExternalLink href={`${text.DOCS_BASE}/${words.docsKey}`}>{text.GUIDE}</ExternalLink>
      </div>
      <p>{text.RUN_AFTER_WARNING}</p>
    </div>
  );
}
