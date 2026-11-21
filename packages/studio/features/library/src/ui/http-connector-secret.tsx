import { halonicCommand } from "@halonicjs/app";
import { CommandBox } from "@halonicjs/studio-kit";
import type { StudioHost } from "@halonicjs/studio-shell";
import { connectionSummaryWords } from "../connection-summary-words.ts";
import type { ConnectorConnection } from "../connector-status-host.ts";

/** Props for {@link HttpConnectorSecret}. */
export interface HttpConnectorSecretProps {
  readonly connection: ConnectorConnection;
  /** Where this window runs; `undefined` when the shell doesn't say. */
  readonly host: StudioHost | undefined;
}

/**
 * Where an HTTP connector's secret is set (`library.http-connector-secret`, C565 #7): per secret,
 * the line that says which store reads it, then the `halonic secret set` command in a box. The
 * page's Secrets section is for a program's secrets only, and this secret lives in the CLI's store,
 * so there is no field to type it in. Nothing for any other connector, or one without a secret.
 */
export function HttpConnectorSecret({ connection, host }: HttpConnectorSecretProps) {
  if (connection.kind !== "http" || connection.secrets.length === 0) return null;
  const words = connectionSummaryWords.httpSecret;
  const lineOf = host === "desktop-app" ? words.desktopApp : words.elsewhere;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {connection.secrets.map((secret) => (
        <div key={secret} className="flex min-w-0 flex-col gap-2">
          <p className="text-body [overflow-wrap:anywhere]">{lineOf(secret)}</p>
          <CommandBox command={setSecretCommand(secret)} />
        </div>
      ))}
    </div>
  );
}

/** `halonic secret set <name>`: the secrets are the profile's, so the command names no folder. */
function setSecretCommand(secret: string): string {
  // With no folder there is always a command; the fallback only satisfies the type.
  return halonicCommand(undefined, "secret set", [secret]) ?? `halonic secret set ${secret}`;
}
