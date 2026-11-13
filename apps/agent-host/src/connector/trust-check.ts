import { asciiAllowedSites } from "@halonicjs/format";
import type { ConnectorPin, TrustGrant, TrustStore } from "@halonicjs/ports";
import { posixPath } from "@halonicjs/std";
import { secretReference } from "@halonicjs/workspace";
import type { OpenConnectorBody } from "./connector-schemas.ts";

/** Why the host won't start a connector, or `undefined` when the workspace's trust covers it. */
export type TrustRefusal = "no_record" | "different_grant" | "connector_not_trusted" | "unreadable";

/**
 * Checks, in the host, that a person trusted this connector as the request
 * describes it. The grant in the request is only a claim: Studio's page
 * could send any grant, so the host reads the trust record in the user's
 * profile itself (`ports.connector-trust-enforcement`).
 *
 * The request passes when:
 * - the grant names the workspace folder and the fingerprint the record holds, and
 * - the record's content lists a `stdio` connector with the request's id whose
 *   program, arguments, folder, environment, secret names, sites and pin
 *   (none in 0.1) are the request's.
 *
 * @param store - the trust records of the user's profile; `undefined` when the host has no profile folder, so nothing is trusted
 * @param workspaceRoot - the workspace folder as a real path
 */
export async function checkTrustGrant(
  store: TrustStore | undefined,
  workspaceRoot: string,
  body: OpenConnectorBody,
): Promise<TrustRefusal | undefined> {
  if (store === undefined) return "no_record";
  let record: Awaited<ReturnType<TrustStore["get"]>>;
  try {
    record = await store.get(workspaceRoot);
  } catch {
    return "unreadable";
  }
  if (record === null) return "no_record";
  if (!isGrantOf(body.trust, workspaceRoot, record.fingerprint)) return "different_grant";
  const pin = trustedPinOf(record.pins, body.id);
  return trustedConnectors(record.content).some((trusted) => describes(trusted, body, pin))
    ? undefined
    : "connector_not_trusted";
}

/** The pin saved for the connector, never one inherited from the object's prototype. */
function trustedPinOf(
  pins: Readonly<Record<string, ConnectorPin>>,
  id: string,
): ConnectorPin | undefined {
  return Object.hasOwn(pins, id) ? pins[id] : undefined;
}

function isGrantOf(grant: TrustGrant, location: string, fingerprint: string): boolean {
  return grant.location === location && grant.fingerprint === fingerprint;
}

/** The program settings of one connector in a trust record's content. */
interface TrustedConnector {
  id: string;
  settings: Record<string, unknown>;
}

/** The `stdio` connectors of a record's content; anything that isn't shaped as trust content has none. */
function trustedConnectors(content: unknown): TrustedConnector[] {
  if (!isObject(content) || !Array.isArray(content["connectors"])) return [];
  return content["connectors"].filter(
    (item): item is TrustedConnector =>
      isObject(item) &&
      item["transport"] === "stdio" &&
      typeof item["id"] === "string" &&
      isObject(item["settings"]),
  );
}

/** Whether the trusted connector starts exactly the program the request asks for, with what it reaches. */
function describes(
  trusted: TrustedConnector,
  body: OpenConnectorBody,
  pin: ConnectorPin | undefined,
): boolean {
  if (trusted.id !== body.id) return false;
  const expected = {
    command: body.command,
    args: body.args,
    cwd: posixPath.normalize(body.cwd ?? "."),
    env: sortedEntries(body.env),
    secretEnv: sortedEntries(referencesTo(body.secretEnv)),
    inheritEnv: [...(body.inheritEnv ?? [])].sort(),
    pin: pinEntries(body.pin),
    sites: asciiAllowedSites(body.sites ?? []).sort(),
  };
  const { settings } = trusted;
  const actual = {
    command: settings["command"],
    args: settings["args"],
    cwd: settings["cwd"],
    env: isObject(settings["env"]) ? sortedEntries(settings["env"]) : undefined,
    secretEnv: isObject(settings["secretEnv"]) ? sortedEntries(settings["secretEnv"]) : undefined,
    // Absent in the content when the file names none.
    inheritEnv: settings["inheritEnv"] ?? [],
    pin: pinEntries(pin),
    sites: settings["sites"] ?? [],
  };
  return JSON.stringify(expected) === JSON.stringify(actual);
}

/** The secret names as the trust content shows them, so the request is compared with the record by name. */
function referencesTo(secretEnv: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(secretEnv).map(([name, secret]) => [name, secretReference(secret)]),
  );
}

/** A pin as comparable entries; `null` for none, which is all a 0.1 record holds. */
function pinEntries(pin: ConnectorPin | undefined): [string, unknown][] | null {
  return pin === undefined ? null : sortedEntries({ ...pin });
}

function sortedEntries(values: Readonly<Record<string, unknown>>): [string, unknown][] {
  return Object.entries(values).sort(([left], [right]) => left.localeCompare(right, "en"));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
