import { type RunnerUnfencedReason, runnerUnfencedWords } from "@halonicjs/app";
import {
  UNFENCED_CHECKBOX,
  YES_NOT_SAVED,
  yesDeclined,
} from "@halonicjs/studio-feature-plugins/api";
import { Button, Checkbox, Dialog, ExternalLink, useModalPolite } from "@halonicjs/studio-kit";
import { errorReasonFor } from "@halonicjs/studio-shell";
import { useEffect, useId, useRef, useState } from "react";
import type { UnfencedYesHost } from "../api.ts";
import * as text from "./sandbox-text.ts";

/** The props of {@link UnfencedAllowDialog}. */
export interface UnfencedAllowDialogProps {
  readonly host: UnfencedYesHost;
  /** The reason the host gave for needing the yes, the one the yes is saved for. */
  readonly reason: RunnerUnfencedReason;
  /** After the host saved the yes: the block reads the status again and closes the dialog. */
  readonly onAllowed: () => void;
  /**
   * After the host saved nothing because the reason changed: the block reads the status again, and
   * the dialog stays open with the reason that holds now while one is still needed. It settles
   * once the status is read.
   */
  readonly onNotSaved: () => Promise<unknown>;
  readonly onCancel: () => void;
  /** Where focus goes once the dialog closes, since **Allow…** has gone with a saved yes. */
  readonly returnFocus: () => HTMLElement | null;
}

/** The props of {@link UnfencedAllow}. */
export interface UnfencedAllowProps {
  readonly host: UnfencedYesHost;
  /** The reason the host gave for needing the yes. */
  readonly reason: RunnerUnfencedReason;
  /** Reads the host's status again; the block shows what it read. */
  readonly read: () => Promise<{ readonly state: string }>;
  /** The block's heading, where focus goes once **Allow…** has gone with a saved yes. */
  readonly heading: () => HTMLElement | null;
  /** After the yes was saved and the status read again: `shown` while the status shows it. */
  readonly onAllowed: (shown: boolean) => void;
}

/**
 * **Allow…** under R16's line while a yes is needed, and its dialog. The dialog closes once the
 * status is read again after the yes was saved, so **Allow…** has gone by then and focus goes to
 * the block's heading.
 */
export function UnfencedAllow({ host, reason, read, heading, onAllowed }: UnfencedAllowProps) {
  const [allowing, setAllowing] = useState(false);
  const allowed = async () => {
    const after = await read();
    setAllowing(false);
    onAllowed(after.state === "allowed");
  };
  return (
    <div className="flex flex-col items-start">
      <Button variant="secondary" size="sm" onClick={() => setAllowing(true)}>
        {text.ALLOW}
      </Button>
      {allowing ? (
        <UnfencedAllowDialog
          host={host}
          reason={reason}
          onAllowed={() => void allowed()}
          onNotSaved={read}
          onCancel={() => setAllowing(false)}
          returnFocus={heading}
        />
      ) : null}
    </div>
  );
}

/** A host refusal's `kind` (the agent host client's `AgentHostError`), if it has one. */
function kindOf(error: unknown): unknown {
  return typeof error === "object" && error !== null && "kind" in error ? error.kind : undefined;
}

/** Why the yes wasn't saved: UY2's words for the host's `allow_failed`, else the shell's reason. */
function allowFailureOf(error: unknown): string {
  return kindOf(error) === "allow_failed" ? `${YES_NOT_SAVED}.` : errorReasonFor(error);
}

/**
 * **Allow…**'s dialog (`settings.unfenced-yes-where`, C665 row 56): R3's reason, fix and docs link,
 * and R5's checkbox right above the buttons, in the plugin check's words. **Allow** stays
 * unavailable, though focusable, until the box is ticked, and the tick belongs to its reason. It
 * saves the yes through the window's one yes object, the one a plugin's Review saves through, so
 * it waits for a Take back under way. When the host saved nothing, the box is unticked, takes the
 * focus, and the dialog's polite region reads the reason once, as the trust checks do (C681).
 * A Cancel in the shell's own window leaves the dialog as it was, the box ticked, with no error.
 */
export function UnfencedAllowDialog(props: UnfencedAllowDialogProps) {
  const { host, reason, onAllowed, onNotSaved } = props;
  const [tickedFor, setTickedFor] = useState<RunnerUnfencedReason | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [sayReason, setSayReason] = useState(false);
  const ticked = tickedFor === reason;
  const checkboxId = useId();
  const words = runnerUnfencedWords(reason, "plugin");
  const allow = () => {
    if (!ticked || busy) return;
    setBusy(true);
    setError(undefined);
    host.allow(reason).then(
      (saved) => {
        // Saved, it stays busy until the block has read the status again and closes it.
        if (saved !== null) {
          onAllowed();
          return;
        }
        setBusy(false);
        setTickedFor(undefined);
        // The reason to read out is the one the status gives now, not the one the box was for.
        void onNotSaved().then(() => setSayReason(true));
      },
      (failure: unknown) => {
        setBusy(false);
        // A Cancel in the shell's own window is the person's choice: the dialog stays as it was.
        if (yesDeclined(failure)) return;
        setError(allowFailureOf(failure));
      },
    );
  };
  return (
    <Dialog
      title={text.ALLOW_TITLE}
      confirm={{
        label: text.ALLOW_CONFIRM,
        busyLabel: text.BUSY_ALLOW,
        ...(ticked ? {} : { unavailable: { reason: checkboxId } }),
      }}
      cancelLabel={text.REMOVE_CANCEL}
      busy={busy}
      {...(error === undefined ? {} : { error })}
      returnFocus={props.returnFocus}
      onConfirm={allow}
      onCancel={props.onCancel}
    >
      <p>
        {words.reason} {words.fix}{" "}
        <ExternalLink href={`${text.DOCS_ADDRESS}/${words.docsKey}`}>
          {words.docsLabel}
        </ExternalLink>
      </p>
      <div className="mt-3">
        <AllowBox
          id={checkboxId}
          reasonLine={words.reason}
          ticked={ticked}
          onTick={(checked) => setTickedFor(checked ? reason : undefined)}
          sayReason={sayReason}
          onSaid={() => setSayReason(false)}
        />
      </div>
    </Dialog>
  );
}

/**
 * R5's checkbox, inside the dialog so it reaches the dialog's polite region: after the host saved
 * nothing, it takes the focus and the region reads the reason that holds now, once.
 */
function AllowBox(props: {
  readonly id: string;
  readonly reasonLine: string;
  readonly ticked: boolean;
  readonly onTick: (checked: boolean) => void;
  readonly sayReason: boolean;
  readonly onSaid: () => void;
}) {
  const box = useRef<HTMLInputElement>(null);
  const polite = useModalPolite();
  const { sayReason, onSaid, reasonLine } = props;
  useEffect(() => {
    if (!sayReason) return;
    box.current?.focus();
    polite?.say(reasonLine);
    onSaid();
  }, [sayReason, onSaid, reasonLine, polite]);
  return (
    <Checkbox ref={box} checked={props.ticked} onChange={props.onTick}>
      <span id={props.id}>{UNFENCED_CHECKBOX}</span>
    </Checkbox>
  );
}
