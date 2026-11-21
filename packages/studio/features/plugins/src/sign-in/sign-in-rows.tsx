import { Button, Spinner, StatusChip } from "@halonicjs/studio-kit";
import type { Ref } from "react";
import type { PluginSignInState } from "./plugin-sign-ins-section.tsx";
import {
  CANCEL,
  OPEN_AGAIN,
  SETTINGS_NEEDED,
  SIGN_IN,
  SIGN_IN_AGAIN,
  SIGN_IN_CHANGED,
  SIGN_OUT,
  SIGNED_IN,
  waitingForBrowser,
} from "./sign-in-text.ts";

/** The props of `WaitingRow`. */
export interface WaitingRowProps {
  readonly ref: Ref<HTMLDivElement>;
  readonly service: string;
  readonly busy: boolean;
  readonly onOpenAgain: () => void;
  readonly onCancel: () => void;
}

/**
 * The browser sign-in is open: a spinner, "Waiting for Acme… Finish in your browser.",
 * **Open again** and **Cancel**, as the Google setup waits. The window's announcer reads the line
 * once when the wait starts, so it is plain text.
 */
export function WaitingRow({ ref, service, busy, onOpenAgain, onCancel }: WaitingRowProps) {
  return (
    <div ref={ref} className="flex flex-wrap items-center gap-2">
      <span className="size-4 text-fg-muted">
        <Spinner />
      </span>
      <p className="text-small text-fg-muted wrap-anywhere">{waitingForBrowser(service)}</p>
      <Button variant="secondary" size="sm" onClick={onOpenAgain}>
        {OPEN_AGAIN}
        <span aria-hidden="true"> ↗</span>
        <span className="sr-only"> (opens in your browser)</span>
      </Button>
      <Button variant="ghost" size="sm" busy={busy} onClick={onCancel}>
        {CANCEL}
      </Button>
    </div>
  );
}

/** The props of `StateRow`. */
export interface StateRowProps {
  readonly state: PluginSignInState | undefined;
  readonly busy: boolean;
  readonly actions: boolean;
  readonly onSignIn: () => Promise<void>;
  readonly onSignOut: () => Promise<void>;
}

/**
 * Where the sign-in stands and its one button. Without actions (the plugin is
 * off, or the page is view only) only the words show.
 */
export function StateRow({ state, busy, actions, onSignIn, onSignOut }: StateRowProps) {
  switch (state) {
    case undefined:
      return null;
    case "cannotSignIn":
      return <p className="text-small text-fg-muted">{SETTINGS_NEEDED}</p>;
    case "signedIn":
      return (
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone="success" dot>
            {SIGNED_IN}
          </StatusChip>
          {actions ? (
            <Button variant="secondary" size="sm" busy={busy} onClick={() => void onSignOut()}>
              {SIGN_OUT}
            </Button>
          ) : null}
        </div>
      );
    case "approvalChanged":
      return (
        <div className="flex flex-col items-start gap-2">
          <p className="text-small text-fg-muted">{SIGN_IN_CHANGED}</p>
          {actions ? (
            <Button variant="primary" size="sm" busy={busy} onClick={() => void onSignIn()}>
              {SIGN_IN_AGAIN}
            </Button>
          ) : null}
        </div>
      );
    case "signedOut":
      return actions ? (
        <div>
          <Button variant="primary" size="sm" busy={busy} onClick={() => void onSignIn()}>
            {SIGN_IN}
          </Button>
        </div>
      ) : null;
  }
}
