import { sandboxStartWords } from "@halonicjs/app";
import type { RunSummary } from "@halonicjs/events";
import {
  Button,
  Callout,
  type CalloutHandle,
  ExternalLink,
  usePresentation,
} from "@halonicjs/studio-kit";
import { useEffect, useId, useRef, useState } from "react";
import { markedName } from "../plain/hidden-characters.ts";
import type { SandboxViewProps } from "../sandbox/sandbox-setup-source.ts";
import { sandboxDocsBase, sandboxInboxWords } from "../sandbox/sandbox-words.ts";
import { CardHeader } from "./card-parts.tsx";

/** What the last check came to. A refusal that follows another shows its own reason. */
type Checked =
  | { readonly kind: "refused"; readonly reason: string }
  | { readonly kind: "failed" }
  | undefined;

/**
 * The sandbox row's card (requirement `inbox.sandbox-row`, checklist 3.5): the reason and then the
 * fix, from the one catalogue, **Check again**, the guide, and the runs that didn't run, each with
 * **Open run**. A passing check makes the card say "Fixed". Nothing runs again by itself, and
 * there is no way to run anyway. **Check again** stays, busy, while a check runs, so it keeps
 * focus; the answer is said through `announce`, and a passing check, which drops the button,
 * moves focus to the "Fixed" line.
 */
export function SandboxSetupView({ item, control, openRun, announce }: SandboxViewProps) {
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  const phone = usePresentation() === "phone";
  const [checked, setChecked] = useState<Checked>();
  const fixedLine = useRef<CalloutHandle>(null);
  const focusFixed = useRef(false);
  const [runs, setRuns] = useState<readonly RunSummary[]>([]);
  const fixed = item.fixed === true;
  // The runs follow the row: its title changes when they do, and when a check fixes them.
  useEffect(() => {
    let current = true;
    void control.runs().then((list) => current && setRuns(list));
    return () => {
      current = false;
    };
  }, [control, item.title, item.changedAt]);

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
        title={markedName(item.title)}
        heading={heading}
        since={fixed ? sandboxInboxWords.fixed : null}
      />
      {fixed ? (
        <Callout tone="info" announce="focus" ref={fixedLine}>
          {sandboxInboxWords.fixedLine}
        </Callout>
      ) : (
        <Callout
          tone="danger"
          action={{
            label: sandboxInboxWords.checkAgain,
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
      {runs.length === 0 ? null : (
        <div className="flex flex-col gap-1">
          <h3 className="text-small text-fg-muted">{sandboxInboxWords.runsHeading}</h3>
          <ul>
            {runs.map((run) => (
              <RunLine key={run.id} run={run} openRun={openRun} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function RunLine({
  run,
  openRun,
}: {
  readonly run: RunSummary;
  readonly openRun: SandboxViewProps["openRun"];
}) {
  const nameId = useId();
  return (
    <li className="flex items-center gap-2 border-b border-border py-2">
      <p id={nameId} className="min-w-0 flex-1 text-body">
        {markedName(run.trigger?.routineId ?? run.workflowId)}
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
