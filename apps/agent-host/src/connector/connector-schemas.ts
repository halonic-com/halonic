import type { ConnectorConfig, ConnectorPin, TrustGrant } from "@halonicjs/ports";
import { type Infer, s } from "@halonicjs/schema-kit";
import { absolutePath } from "../sandbox/profile-schema.ts";
import { portSchema } from "../server/port-schema.ts";

const text = s.string().min(1);

const pin = portSchema<ConnectorPin>(
  s
    .object({
      registry: s.enum(["npm", "pypi"]),
      registryUrl: text,
      package: text,
      version: text,
    })
    .strict(),
);

const trust = portSchema<TrustGrant>(s.object({ location: text, fingerprint: text }).strict());

/**
 * What Studio gives to open a workspace `stdio` connector in the host: the
 * connector as its file says it, the trust grant, and the folders the
 * program is placed from. It never holds a sandbox profile: the host builds
 * the connector's place itself, so the page can't make it wider.
 *
 * `secrets` holds the values of the connector's own `secretEnv` names only;
 * the host never reads Studio's secret store.
 */
export const openConnectorBody = s
  .object({
    id: text,
    command: text,
    args: s.array(s.string()),
    env: s.record(s.string(), s.string()),
    inheritEnv: s.array(s.string()).optional(),
    cwd: s.string().optional(),
    sites: s.array(s.string()).optional(),
    pin: pin.optional(),
    secretEnv: s.record(s.string(), s.string()),
    secrets: s.record(s.string(), s.string()),
    workspaceRoot: absolutePath,
    workingFolders: s.array(absolutePath),
    trust,
  })
  .strict();

export type OpenConnectorBody = Infer<typeof openConnectorBody>;

export const connectorBody = s.object({ connector: text }).strict();

export const callToolBody = s
  .object({
    connector: text,
    tool: text,
    args: s.record(s.string(), s.unknown()),
    idempotencyKey: s.string().optional(),
  })
  .strict();

/** The connector the body describes, as the factory takes it. */
export function configOf(body: OpenConnectorBody): ConnectorConfig {
  const { id, command, args, env, secretEnv } = body;
  return {
    id,
    secretEnv,
    transport: {
      kind: "stdio",
      command,
      args,
      env,
      ...(body.inheritEnv === undefined ? {} : { inheritEnv: body.inheritEnv }),
      ...(body.cwd === undefined ? {} : { cwd: body.cwd }),
      ...(body.sites === undefined ? {} : { sites: body.sites }),
      ...(body.pin === undefined ? {} : { pin: body.pin }),
    },
  };
}
