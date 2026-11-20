import { connectionStateOf, connectionStateTable } from "@halonicjs/studio-feature-library/api";
import {
  Button,
  CopyButton,
  ExternalLink,
  StatusChip,
  usePresentation,
  ViewOnlyLine,
} from "@halonicjs/studio-kit";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { accountSteps } from "../account-steps.ts";
import type { DisconnectAnswer, GoogleSetupAccount, SecretEntry } from "../api.ts";
import { connectorFacts } from "../connector-facts.ts";
import { accountTypeNames, listNames } from "./account-labels.ts";
import { Disconnect } from "./disconnect.tsx";
import { type KeptOn, keptLine, routeLine, savedOn } from "./secret-words.ts";

/** Props for {@link GoogleConnectorBlock}. */
export interface GoogleConnectorBlockProps {
  /** The account as the host has it now, read again after a change. */
  readonly account: GoogleSetupAccount;
  readonly secretEntry: SecretEntry;
  readonly answering: boolean;
  /** Opens the account's setup item in the Inbox: to set up, sign in again or replace the secret. */
  readonly onOpenSetup: (accountRef: string) => void;
  /** Disconnects the account and reads it again. It rejects when that can't be done. */
  readonly onDisconnect: () => Promise<DisconnectAnswer>;
  /**
   * Text only, with no Set up, Sign in again, Replace secret or Disconnect: the Studio runs on a
   * phone (`context.host`). A narrow desktop window keeps them and only gets the phone's layout.
   */
  readonly viewOnly?: boolean;
}

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <dt className="w-32 shrink-0 text-body text-fg-muted">{label}</dt>
      <dd className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-body">{children}</dd>
    </div>
  );
}

interface BlockRowsProps {
  readonly account: GoogleSetupAccount;
  readonly keptOn: KeptOn;
  /** The rows stack their label over the value, as on a phone's width. */
  readonly phone: boolean;
  /** No Sign in again or Replace secret (see `GoogleConnectorBlockProps.viewOnly`). */
  readonly viewOnly: boolean;
  /** The client's page in Google Cloud, when the project is known. */
  readonly clientsUrl: string | undefined;
  readonly onOpenSetup: (accountRef: string) => void;
}

/** The block's rows (design 4.4). A row whose value isn't in the record is left out. */
function BlockRows(props: BlockRowsProps) {
  const { account, keptOn, phone, viewOnly, clientsUrl, onOpenSetup } = props;
  const { record } = account;
  const ref = record.accountRef;
  const shared = account.clientSharedWith;
  return (
    <dl className={`flex flex-col gap-2 ${phone ? "[&>div]:flex-col [&>div]:items-start" : ""}`}>
      <Row label="Signed in as">
        <span>
          {account.email}
          {record.lastSignInAt === null ? "" : ` · ${savedOn(record.lastSignInAt)}`}
        </span>
        {viewOnly ? null : (
          <Button variant="ghost" size="sm" onClick={() => onOpenSetup(ref)}>
            Sign in again
          </Button>
        )}
      </Row>
      <Row label="Route">{routeLine(keptOn)}</Row>
      <Row label="Account type">{accountTypeNames[record.accountType]}</Row>
      {record.projectId === null ? null : (
        <Row label="Google project">
          <span>{record.projectId}</span>
          {clientsUrl === undefined ? null : <ExternalLink href={clientsUrl}>Open</ExternalLink>}
        </Row>
      )}
      {record.clientId === null ? null : (
        <Row label="Client ID">
          <code className="min-w-0 break-all">{record.clientId}</code>
          <CopyButton text={record.clientId} label="Copy the client ID" />
        </Row>
      )}
      {record.clientSecret === null ? null : (
        <Row label="Client secret">
          <span>{`Saved · ${savedOn(record.clientSecret.savedAt)}`}</span>
          {viewOnly ? null : (
            <Button variant="ghost" size="sm" onClick={() => onOpenSetup(ref)}>
              Replace secret
            </Button>
          )}
          {shared.length === 0 ? null : (
            <span className="text-fg-muted">{`Used by ${listNames([account.email, ...shared])}`}</span>
          )}
          <span className="basis-full text-small text-fg-muted">{keptLine(keptOn)}</span>
        </Row>
      )}
      <Row label="Allowed">
        {account.services.map((service) => (
          <StatusChip key={service.id} tone="success" dot>
            {service.label}
          </StatusChip>
        ))}
      </Row>
    </dl>
  );
}

/**
 * The Google block of the connector page (UX checklist 3.4): before setup, **Set up**; after it,
 * the account's rows, a state chip that reads the same facts as the connector's status view, and
 * **Disconnect Google…**. **Sign in again** and **Replace secret** open the setup item, which owns
 * those steps. On a phone it is text only (`viewOnly`); a narrow desktop window keeps its buttons.
 * The client secret is never shown: the row says only
 * that it is saved and when.
 */
export function GoogleConnectorBlock(props: GoogleConnectorBlockProps) {
  const { account, secretEntry, answering, onOpenSetup, onDisconnect, viewOnly = false } = props;
  const phone = usePresentation() === "phone";
  const titleId = useId();
  const { record } = account;
  const ref = record.accountRef;
  const state = connectionStateTable[connectionStateOf(connectorFacts(account))];
  const setUp = record.lastSignInAt !== null || record.clientSecret !== null;
  const setUpButton = useRef<HTMLButtonElement>(null);
  // Set after a disconnect, so focus goes to **Set up** once the block shows it.
  const [disconnected, setDisconnected] = useState(false);
  useEffect(() => {
    if (disconnected && !setUp) {
      setUpButton.current?.focus();
      setDisconnected(false);
    }
  }, [disconnected, setUp]);

  const clientsLink = accountSteps(account, account.services)
    .flatMap((step) => step.links)
    .find((link) => link.id === "clients");
  const keptOn = secretEntry.kind === "field" ? secretEntry.keptOn : "this-computer";
  const shared = account.clientSharedWith;

  if (!setUp) {
    return (
      <section aria-labelledby={titleId} className="flex flex-col gap-3">
        <h2 id={titleId} className="text-heading">
          Google account
        </h2>
        <p className="text-body text-fg-muted">{account.email} isn't signed in to Google yet.</p>
        {viewOnly ? (
          <ViewOnlyLine>Set this up on a computer.</ViewOnlyLine>
        ) : (
          <div>
            <Button ref={setUpButton} variant="primary" onClick={() => onOpenSetup(ref)}>
              Set up
            </Button>
          </div>
        )}
      </section>
    );
  }
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={titleId} className="text-heading">
          Google account
        </h2>
        <StatusChip tone={state.tone} dot>
          {state.label}
        </StatusChip>
      </div>
      <h3 className="text-body-strong">How it connects</h3>
      <BlockRows
        account={account}
        keptOn={keptOn}
        phone={phone}
        viewOnly={viewOnly}
        clientsUrl={clientsLink?.url}
        onOpenSetup={onOpenSetup}
      />
      {viewOnly ? (
        <ViewOnlyLine>
          View only on a phone. Change connectors and sending on your computer.
        </ViewOnlyLine>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Disconnect
            email={account.email}
            serviceNames={account.services.map((service) => service.label)}
            clientSharedWith={shared}
            answering={answering}
            onDisconnect={async () => {
              const answer = await onDisconnect();
              setDisconnected(true);
              return answer;
            }}
          />
        </div>
      )}
    </section>
  );
}
