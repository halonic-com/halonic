import { ActionBar, Button, Callout, type CalloutHandle } from "@halonicjs/studio-kit";
import { useEffect, useId, useRef } from "react";
import type { Version } from "../api.ts";
import type { ChangesList } from "../changes-list.ts";
import { goBackWords, mergeWords, restoreWords } from "../changes-words.ts";
import { sharedAfter } from "../go-back.ts";
import type { GoingBack } from "./use-go-back.ts";

/** Props for {@link GoBackButton} and {@link GoBackBar}. */
export interface GoBackProps {
  readonly version: Version;
  readonly list: ChangesList;
  readonly going: GoingBack;
}

/**
 * The line said before Go back (2.9, 2.14): while a merge of updates is started, why it waits;
 * else, when versions after this one are shared, that the team keeps them; else none.
 */
function goBackLine(list: ChangesList, version: Version): string | undefined {
  if (list.merging) return mergeWords.finishFirst;
  return sharedAfter(list.state, version.id) ? goBackWords.sharedAfter : undefined;
}

/** **Go back to this version** in the desktop's details, under the line said before it. */
export function GoBackButton({ version, list, going }: GoBackProps) {
  const lineId = useId();
  const line = goBackLine(list, version);
  return (
    <div className="flex flex-col items-start gap-2">
      {line === undefined ? null : (
        <p id={lineId} className="text-small text-fg-muted">
          {line}
        </p>
      )}
      <Button
        variant="secondary"
        size="sm"
        busy={going.busy}
        busyLabel={goBackWords.goingBack}
        unavailable={list.merging ? { reason: lineId } : undefined}
        onClick={() => void going.goBack(version)}
      >
        {goBackWords.goBack}
      </Button>
    </div>
  );
}

/** The phone version page's bottom bar: the line said before Go back as its text line, then the button. */
export function GoBackBar({ version, list, going }: GoBackProps) {
  const lineId = useId();
  const line = goBackLine(list, version);
  return (
    <ActionBar
      whileTyping="hide"
      lead={
        line !== undefined && (
          <p id={lineId} className="text-small text-fg-muted">
            {line}
          </p>
        )
      }
      rows={[
        [
          {
            label: goBackWords.goBack,
            busy: going.busy,
            busyLabel: goBackWords.goingBack,
            unavailable: list.merging ? { reason: lineId } : undefined,
            onClick: () => void going.goBack(version),
          },
        ],
      ]}
    />
  );
}

/**
 * The warning when Go back failed and so did putting the files back (2.9, as 2.5): the files not
 * as they were, up to three then "and N more", with Try again; focus moves to it.
 */
export function GoBackPartialCallout({ going }: { readonly going: GoingBack }) {
  const callout = useRef<CalloutHandle>(null);
  const { partial } = going;
  useEffect(() => {
    if (partial !== undefined) callout.current?.focus();
  }, [partial]);
  if (partial === undefined) return null;
  return (
    <Callout
      ref={callout}
      announce="focus"
      tone="warning"
      title={goBackWords.partialTitle(partial.version.name)}
      files={partial.paths}
      action={{
        label: restoreWords.tryAgain,
        busyLabel: goBackWords.goingBack,
        onClick: going.retry,
      }}
    >
      {restoreWords.partialBody(partial.paths.length, partial.reason)}
    </Callout>
  );
}
