import { halonicCommand } from "@halonicjs/app";
import { isSecretName, secretKey } from "@halonicjs/ports";
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
 * Whether the page shows {@link HttpConnectorSecret}'s lines for this connection: a connector over
 * HTTP that names a secret. The connection summary then leaves out its Secrets row, since every
 * name is in a line here (C618 #2).
 */
export function hasHttpSecretLines(connection: ConnectorConnection): boolean {
  return connection.kind === "http" && connection.secrets.length > 0;
}

/**
 * Where an HTTP connector's secret is set (`library.http-connector-secret`, C565 #7, C618 #2): per
 * secret, the line that says which store reads it, the `halonic secret set` command in a box, then
 * the `HALONIC_SECRET_<NAME>` variable as the other way. The page's Secrets section is for a
 * program's secrets only, and this secret lives in the CLI's store, so there is no field to type it
 * in and no Set or Not set. Nothing for any other connector, or one without a secret.
 */
export function HttpConnectorSecret({ connection, host }: HttpConnectorSecretProps) {
  if (connection.kind !== "http" || !hasHttpSecretLines(connection)) return null;
  const words = connectionSummaryWords.httpSecret;
  const where = host === "desktop-app" ? "desktopApp" : "elsewhere";
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {connection.secrets.map((secret) => {
        const variable = secretVariableName(secret);
        return (
          <div key={secret} className="flex min-w-0 flex-col gap-2">
            <p className="text-body [overflow-wrap:anywhere]">{words[where](secret)}</p>
            <CommandBox command={setSecretCommand(secret)} />
            {variable === undefined ? null : (
              <p className="text-body text-fg-muted [overflow-wrap:anywhere]">
                {words.after[where](variable)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** `halonic secret set <name>`: the secrets are the profile's, so the command names no folder. */
function setSecretCommand(secret: string): string {
  // With no folder there is always a command; the fallback only satisfies the type.
  return halonicCommand(undefined, "secret set", [secret]) ?? `halonic secret set ${secret}`;
}

/**
 * The variable the CLI also reads the secret from, named as the environment adapter names it
 * (`HALONIC_SECRET_` and the port's key), or `undefined` for a name no store takes, which the
 * file's own check reports.
 */
function secretVariableName(secret: string): string | undefined {
  return isSecretName(secret) ? `HALONIC_SECRET_${secretKey(secret)}` : undefined;
}
