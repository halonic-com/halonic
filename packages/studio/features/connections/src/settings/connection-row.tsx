import {
  Button,
  Callout,
  Card,
  LetterTile,
  ShieldIcon,
  StatusChip,
  type StatusChipTone,
} from "@halonicjs/studio-kit";
import type { AgentConnection } from "@halonicjs/studio-services";
import { type Ref, useId } from "react";
import * as words from "../connections-words.ts";

const chipTones: Record<AgentConnection["state"]["kind"], StatusChipTone> = {
  online: "success",
  offline: "attention",
  "signed-out": "danger",
  // Nothing failed and nothing was revoked: this computer just holds no key yet (HAL-19034).
  "no-key": "neutral",
};

/** The address's host, as the row shows it: `paperclip.halonic.test`. */
function hostOf(address: string): string {
  try {
    return new URL(address).host;
  } catch {
    return address;
  }
}

/** What the row says under its name while the connection can't be used, if anything. */
function StateCallout({
  connection,
  onSignInAgain,
}: {
  readonly connection: AgentConnection;
  readonly onSignInAgain: () => void;
}) {
  const { state } = connection;
  switch (state.kind) {
    case "online":
      return null;
    case "offline":
      return <Callout tone="attention">{words.OFFLINE_CALLOUT}</Callout>;
    case "signed-out":
      return (
        <Callout tone="danger" action={{ label: words.SIGN_IN_AGAIN, onClick: onSignInAgain }}>
          {words.SIGNED_OUT_CALLOUT}
        </Callout>
      );
    case "no-key":
      return (
        <Callout tone="info" action={{ label: words.SIGN_IN, onClick: onSignInAgain }}>
          {words.NO_KEY_CALLOUT}
        </Callout>
      );
    default:
      return unknownState(state);
  }
}

/** Fails typecheck when a state kind is added without its callout. */
function unknownState(state: never): never {
  throw new Error(`No callout for the connection state ${JSON.stringify(state)}.`);
}

/**
 * One connection, shown like a read-only hub (`connections.connection-row`): its name, host and
 * state, Sign in again once it is signed out, Sign in while this computer holds no key for it, Add another account while it is connected
 * (`connections.add-account`), what its key can do, and Disconnect.
 */
export function ConnectionRow({
  connection,
  disconnectRef,
  onSignInAgain,
  onAddAccount,
  onDisconnect,
}: {
  readonly connection: AgentConnection;
  /** The Disconnect button, where the section puts focus after a dialog closed. */
  readonly disconnectRef: Ref<HTMLButtonElement>;
  readonly onSignInAgain: () => void;
  /** Opens the dialog for another account on this connection's Paperclip. */
  readonly onAddAccount: () => void;
  /** Asks before it disconnects: the section opens the confirmation. */
  readonly onDisconnect: () => void;
}) {
  // With several rows, every button says Disconnect: the row's name says which one.
  const nameId = useId();
  return (
    <li>
      <Card>
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <LetterTile name={connection.provider} size="md" />
            <div className="flex min-w-0 grow flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <p id={nameId} className="m-0 text-body-strong text-fg">
                  {connection.label}
                </p>
                <StatusChip tone="outline">{words.READ_ONLY}</StatusChip>
                <StatusChip tone={chipTones[connection.state.kind]} dot>
                  {words.stateChips[connection.state.kind]}
                </StatusChip>
              </div>
              <p className="m-0 break-all text-small text-fg-muted">
                <span className="font-mono">{hostOf(connection.address)}</span>
                {` · ${words.stateMeta(connection.state, connection.keyExpiresAt)}`}
              </p>
            </div>
            {connection.state.kind === "online" ? (
              <Button
                variant="secondary"
                size="sm"
                aria-describedby={nameId}
                onClick={onAddAccount}
              >
                {words.ADD_ACCOUNT}
              </Button>
            ) : null}
            <Button
              ref={disconnectRef}
              variant="danger-outline"
              size="sm"
              aria-describedby={nameId}
              onClick={onDisconnect}
            >
              {words.DISCONNECT}
            </Button>
          </div>
          <StateCallout connection={connection} onSignInAgain={onSignInAgain} />
          <p className="m-0 flex items-center gap-2 border-t border-border pt-3 text-small text-fg-muted">
            <span className="inline-grid size-icon-sm shrink-0 place-items-center *:size-full">
              <ShieldIcon />
            </span>
            {words.KEY_POWER}
          </p>
        </div>
      </Card>
    </li>
  );
}
