import { type SandboxStartWords, sandboxStartWords } from "@halonicjs/app";
import { Button, Callout, ExternalLink, usePresentation } from "@halonicjs/studio-kit";
import { copyDetailsWords, useCopyDetails } from "@halonicjs/studio-shell";
import type { ReactNode } from "react";
import { cantRunWords } from "./cant-run-words.ts";
import type { SandboxStart } from "./use-sandbox-start.ts";

/** Props for {@link SandboxCantRunCallout}. */
export interface SandboxCantRunCalloutProps {
  /** What can't run: the workflow, the routine or the agent, as its page names it. */
  readonly name: string;
  /** The page's {@link SandboxStart}; the Callout draws only while `refused` names a reason. */
  readonly start: SandboxStart;
  /**
   * The `id` of the first line. The page points every control the Callout disables at it
   * (`unavailable={{ reason: firstLineId }}`), so a keyboard or screen reader user hears why.
   */
  readonly firstLineId: string;
  /** Reads a line to screen readers, politely; without it nothing is read. */
  readonly announce?: ((line: string) => void) | undefined;
  /** Called once **Check again** finds the sandbox ready, so the page can move focus to its control. */
  readonly onReady?: (() => void) | undefined;
  /** A full-width band under the page header, with a line under it, rather than a box in a column. */
  readonly band?: boolean;
  /** The last line, in muted text: on the workflow page, the step that starts a program. */
  readonly children?: ReactNode;
}

/**
 * Why a run can't start here and what fixes it (requirement `runs.sandbox-cant-run`, microcopy
 * 23.3): the first line, the reason only for `other`, the fix, then **Check again** and the guide,
 * and for `other` **Copy details**, then the page's own last line. The fix comes first because it is
 * what the person does next. There is no way to run anyway: **Check again** never runs or changes
 * anything, and **Copy details** only copies. On a phone the fix says to do it on the computer.
 * The check's own sentences go only to the clipboard, never on screen (HAL-2089).
 *
 * @example
 * const start = useSandboxStart(check, true);
 * const firstLineId = useId();
 * <SandboxCantRunCallout name="Support reply" start={start} firstLineId={firstLineId} band />
 */
export function SandboxCantRunCallout({
  name,
  start,
  firstLineId,
  announce,
  onReady,
  band = false,
  children,
}: SandboxCantRunCalloutProps) {
  const phone = usePresentation() === "phone";
  const copyDetails = useCopyDetails();
  if (start.refused === undefined) return null;
  const words = sandboxStartWords(start.refused);
  // Only `other` says what is wrong, because its fix doesn't (microcopy 23.3, revision 51).
  const unknown = words.key === sandboxStartWords("other").key;

  const checkAgain = async () => {
    const outcome = await start.checkAgain();
    if (outcome.kind === "ready") {
      announce?.(cantRunWords.ready(name));
      onReady?.();
    } else if (outcome.kind === "refused") {
      announce?.(cantRunWords.checkedRefused(sandboxStartWords(outcome.reason).reason));
    } else {
      announce?.(cantRunWords.checkFailed);
    }
  };

  const callout = (
    <Callout tone="warning">
      <span id={firstLineId} className="block text-body-strong">
        {cantRunWords.cantRun(name)}
      </span>
      {unknown ? <span className="block">{words.reason}</span> : null}
      <span className="block" data-part="fix">
        <WithCommand text={phone ? words.cantRunPhoneFix : words.cantRunFix} words={words} />
      </span>
      {start.checkFailed ? <span className="block">{cantRunWords.checkFailed}</span> : null}
      <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          variant="secondary"
          size="sm"
          busy={start.checking}
          busyLabel={cantRunWords.checking}
          onClick={() => void checkAgain()}
        >
          {cantRunWords.checkAgain}
        </Button>
        <ExternalLink href={`${cantRunWords.docsBase}/${words.docsKey}`}>
          {cantRunWords.docs}
        </ExternalLink>
        {unknown ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void copyDetails(detailsOf(name, words.reason, start.details))}
          >
            {copyDetailsWords.label}
          </Button>
        ) : null}
      </span>
      {children === undefined ? null : <span className="mt-2 block text-fg-muted">{children}</span>}
    </Callout>
  );
  if (!band) return callout;
  return <div className="border-b border-border px-6 py-3 phone:px-4">{callout}</div>;
}

/**
 * What **Copy details** puts on the clipboard for `other`: the first line, the reason, then the
 * check's own sentences when it gave any.
 */
function detailsOf(name: string, reason: string, details: string | undefined): string {
  return [cantRunWords.cantRun(name), reason, details ?? ""]
    .filter((line) => line !== "")
    .join("\n");
}

/** The fix, with the command it names as code that can be selected and copied, and wraps. */
function WithCommand({
  text,
  words,
}: {
  readonly text: string;
  readonly words: SandboxStartWords;
}) {
  const at = words.command === undefined ? -1 : text.indexOf(words.command);
  if (words.command === undefined || at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <code className="rounded-xs bg-surface px-1 font-mono text-code wrap-anywhere select-text">
        {words.command}
      </code>
      {text.slice(at + words.command.length)}
    </>
  );
}
