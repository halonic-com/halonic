import { sandboxStartWords } from "@halonicjs/app";
import type { RunSummary } from "@halonicjs/events";
import { markHiddenName } from "@halonicjs/std";
import { Button, Callout, ExternalLink, usePresentation } from "@halonicjs/studio-kit";
import { useEffect, useId, useRef, useState } from "react";
import type { SandboxViewProps } from "../sandbox/sandbox-setup-source.ts";
import { sandboxDocsBase, sandboxInboxWords } from "../sandbox/sandbox-words.ts";
import { CardHeader } from "./card-parts.tsx";
import { QuietLine } from "./quiet-line.tsx";

/** What the last check came to. A refusal that follows another shows its own reason. */
type Checked =
  | { readonly kind: "refused"; readonly reason: string }
  | { readonly kind: "failed" }
  | undefined;

/**
 * The sandbox row's card (requirement `inbox.sandbox-row`, checklist 3.5): the reason and then the
 * fix, from the one catalogue, **Check again**, the guide, and the runs that didn't run, each with
 * **Open run**, then the footer (mc 23.3). A passing check makes the card say "Fixed", with the
 * footer as `success` text in place of the Callout. No failed run runs again by itself (the footer says routines start again at their next time),
 * and there is no way to run anyway. **Check again** stays, busy ("Checking…"), while a check runs, so it keeps
 * focus; the answer is said through `announce`, and a passing check, which drops the button,
 * moves focus to the "Fixed" line.
 */
export function SandboxSetupView({ item, control, openRun, announce }: SandboxViewProps) {
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  const phone = usePresentation() === "phone";
  const [checked, setChecked] = useState<Checked>();
  const fixedLine = useRef<HTMLParagraphElement>(null);
  const focusFixed = useRef(false);
  const [runs, setRuns] = useState<readonly RunSummary[] | "failed">([]);
  const [tries, setTries] = useState(0);
  const fixed = item.fixed === true;
  // The runs follow the row: its title changes when they do, and when a check fixes them.
  // `tries` counts the presses of Try again, so each press reads again.
  useEffect(() => {
    let current = true;
    control.runs().then(
      (list) => current && setRuns(list),
      () => current && setRuns("failed"),
    );
    return () => {
      current = false;
    };
  }, [control, item.title, item.changedAt, tries]);

  const checkAgain = async () => {
    try {
      const result = await control.check();
      focusFixed.current = result.ok;
      setChecked(result.ok ? undefined : { kind: "refused", reason: result.reason });
      announce?.(
        result.ok
          ? sandboxInboxWords.checkedReady
          : sandboxInboxWords.checkedRefused(sandboxStartWords(result.reason).reason),
      );
    } catch {
      setChecked({ kind: "failed" });
      announce?.(sandboxInboxWords.checkFailed);
    }
  };
  // The button is gone once the card says "Fixed", so a press that fixed it moves focus there.
  useEffect(() => {
    if (fixed && focusFixed.current) fixedLine.current?.focus();
  }, [fixed]);

  const words = sandboxStartWords(checked?.kind === "refused" ? checked.reason : control.reason());
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4 p-4">
      <CardHeader
        titleId={titleId}
        title={markHiddenName(item.title)}
        heading={heading}
        since={fixed ? sandboxInboxWords.fixed : null}
      />
      {fixed ? (
        <p ref={fixedLine} tabIndex={-1} className="focus-ring text-small text-success">
          {sandboxInboxWords.footer}
        </p>
      ) : (
        <Callout
          tone="danger"
          action={{
            label: sandboxInboxWords.checkAgain,
            busyLabel: sandboxInboxWords.checking,
            onClick: checkAgain,
          }}
        >
          <span className="block">{words.reason}</span>
          <span className="block">{phone ? words.phoneFix : words.calloutFix}</span>
          {checked?.kind === "failed" ? (
            <span className="block">{sandboxInboxWords.checkFailed}</span>
          ) : null}
        </Callout>
      )}
      {fixed ? null : (
        <p>
          <ExternalLink href={`${sandboxDocsBase}/${words.docsKey}`}>
            {sandboxInboxWords.docs}
          </ExternalLink>
        </p>
      )}
      {runs === "failed" ? (
        <QuietLine line={sandboxInboxWords.runsFailed} retry={() => setTries((n) => n + 1)} />
      ) : null}
      {runs === "failed" || runs.length === 0 ? null : (
        <div className="flex flex-col gap-1">
          <h3 className="text-small text-fg-muted">{sandboxInboxWords.runsHeading}</h3>
          <ul>
            {runs.map((run) => (
              <RunLine key={run.id} run={run} name={control.name(run)} openRun={openRun} />
            ))}
          </ul>
        </div>
      )}
      {fixed ? null : <p className="text-small text-fg-muted">{sandboxInboxWords.footer}</p>}
    </section>
  );
}

function RunLine({
  run,
  name,
  openRun,
}: {
  readonly run: RunSummary;
  readonly name: string;
  readonly openRun: SandboxViewProps["openRun"];
}) {
  const nameId = useId();
  return (
    <li className="flex items-center gap-2 border-b border-border py-2">
      <p id={nameId} className="min-w-0 flex-1 text-body">
        {markHiddenName(name)}
      </p>
      {openRun === undefined ? null : (
        <Button
          variant="ghost"
          size="sm"
          aria-describedby={nameId}
          onClick={() => openRun(run.hubId, run.id)}
        >
          {sandboxInboxWords.openRun}
        </Button>
      )}
    </li>
  );
}
