import { useId } from "react";
import { connectionSummaryWords } from "../connection-summary-words.ts";
import type { ConnectorConnection } from "../connector-status-host.ts";

/** The one value that says where a connection goes: the account, the address, the command or the folder. */
function detailOf(connection: ConnectorConnection): string {
  switch (connection.kind) {
    case "google":
      return connection.account;
    case "http":
      return connection.url;
    case "stdio":
      return connection.command;
    case "integration":
      return connection.folder;
    case "plugin":
      return connection.id;
  }
}

/**
 * The names of the secrets the connection uses, or null when the row would mislead. Google keeps none;
 * a plugin or an integration declares its secrets in its own sheet, which the summary can't see, so
 * it shows no row rather than a false "none".
 */
function secretsOf(connection: ConnectorConnection): readonly string[] | null {
  switch (connection.kind) {
    case "http":
    case "stdio":
      return connection.secrets;
    case "google":
      return [];
    case "integration":
    case "plugin":
      return null;
  }
}

/**
 * How one connector connects, for the connector page to put above its status: the transport, where
 * it goes, and the names of its secrets (never their values; no row for an integration or a plugin),
 * as plain rows under a heading. It is a plain `div`, with no landmark of its own: the shell owns
 * the landmarks.
 */
export function ConnectorConnectionSummary({
  connection,
}: {
  readonly connection: ConnectorConnection;
}) {
  const headingId = useId();
  const secrets = secretsOf(connection);
  const words = connectionSummaryWords;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h2 id={headingId} className="text-heading [overflow-wrap:anywhere]">
        {words.heading}
      </h2>
      <dl aria-labelledby={headingId} className="m-0 flex min-w-0 flex-col gap-1">
        <Row label={words.transport} value={words.transports[connection.kind]} />
        <Row label={words.detail[connection.kind]} value={detailOf(connection)} />
        {secrets === null ? null : (
          <Row
            label={words.secrets}
            value={secrets.length === 0 ? words.noSecrets : secrets.join(", ")}
          />
        )}
      </dl>
    </div>
  );
}

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex min-w-0 flex-wrap gap-x-3">
      <dt className="w-28 shrink-0 text-body text-fg-muted">{label}</dt>
      <dd className="m-0 min-w-0 text-body [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}
