import { checkPinnedLaunch } from "@halonicjs/adapter-mcp";
import type {
  ConnectorConfig,
  ConnectorFactoryContext,
  SandboxCommand,
  SandboxSession,
  Secrets,
} from "@halonicjs/ports";
import { type LocalToolPlace, localToolLaunch, type StdioConfig } from "./local-tool-launch.ts";
import { profileDifferences } from "./profile-check.ts";

/** What the connector checks its launch against. */
export interface LaunchChecks {
  readonly config: ConnectorConfig;
  readonly stdio: StdioConfig;
  /** Where the host set the local tool up. */
  readonly place: LocalToolPlace;
  readonly session: SandboxSession;
  readonly context: Pick<ConnectorFactoryContext, "secrets" | "http">;
}

/**
 * The command to start in the session, once every check before it passed:
 * the launch passes the pin rules (and a
 * pin is looked up at its registry, through `context.http`, exactly as
 * `checkPinnedLaunch` does on this computer), every secret is set, and
 * the session's profile is exactly the one {@link localToolLaunch} builds
 * from the same place, pin and secrets.
 *
 * Every refusal names what is wrong, never a value: a profile that differs
 * is reported by its field names, as `profileDifferences` gives them.
 *
 * @throws when a check fails
 */
export async function planLaunch(checks: LaunchChecks): Promise<SandboxCommand> {
  const { config, stdio, place, session, context } = checks;
  const id = config.id;
  if (stdio.cwd !== undefined) {
    throw new Error(
      `Connector "${id}" names a folder to start in, but a local tool starts in the working folder Halonic chose for it.`,
    );
  }
  // The session's profile holds no variable from this computer's environment to take one from.
  if ((stdio.inheritEnv ?? []).length > 0) {
    throw new Error(
      `Connector "${id}" names variables to take from your environment, but a local tool in a sandbox gets none of them. Set them under env or secretEnv instead.`,
    );
  }
  const pin = await checkPinnedLaunch(stdio, config.secretEnv, context.http);
  if (!pin.ok) throw new Error(`Halonic didn't start the connector "${id}": ${pin.error}.`);
  const secretEnv = await readSecretEnv(id, config.secretEnv, context.secrets);
  const expected = localToolLaunch(stdio, place, pin.value, secretEnv);
  const differences = profileDifferences(session.profile, expected.profile);
  if (differences.length > 0) {
    throw new Error(
      `Connector "${id}" didn't start: its sandbox session's profile isn't the one Halonic built for it (${differences.join(", ")}).`,
    );
  }
  return expected.command;
}

/**
 * The values of a connector's secrets, by the variable each is given as.
 * The host reads them with this too, when it builds the profile.
 *
 * @throws naming the first secret that isn't set
 */
export async function readSecretEnv(
  connectorId: string,
  secretEnv: Readonly<Record<string, string>>,
  secrets: Secrets,
): Promise<Record<string, string>> {
  const values: Record<string, string> = {};
  for (const [variable, secretName] of Object.entries(secretEnv)) {
    const value = await secrets.get(secretName);
    if (value === null) {
      throw new Error(
        `Connector "${connectorId}" needs the secret "${secretName}", which isn't set.`,
      );
    }
    values[variable] = value;
  }
  return values;
}
