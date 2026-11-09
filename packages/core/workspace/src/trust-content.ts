import type { Connector } from "@halonicjs/format";
import { posixPath } from "@halonicjs/std";
import { trustUrl } from "./trust-url.ts";

/** Connector fields that only label it. They decide nothing, so they stay out of the content. */
const labelFields = new Set(["name", "description"]);

/**
 * The normalised content of a workspace that its trust fingerprint covers:
 * everything that decides which programs run and where they talk to
 * (HAL-65 section 4, and the "Fingerprint coverage" rules of HAL-188).
 *
 * Plain JSON data, so the trust record can keep it and show later what
 * changed. Lists that a person wrote in order (a program's arguments) keep
 * their order; sets (connectors, tool names) are sorted.
 */
export interface TrustContent {
  /** Every connector, sorted by id. */
  connectors: ConnectorTrustContent[];
}

/**
 * One connector's part of the trust content. The known fields are
 * normalised; every other field of the connector file is kept as written,
 * so a field added to the schema later can't slip past the fingerprint.
 */
export interface ConnectorTrustContent {
  id: string;
  /** `stdio`, `http` or `google`, so switching transport is a change. */
  transport: string;
  /** The transport's settings, normalised. */
  settings: Record<string, unknown>;
  /** The secret the connector uses, by name only: `‹secret NAME›`. */
  secret?: string;
  /** The tool lists, with their names sorted. */
  tools: Record<string, unknown>;
  /** Every other field of the connector file, except its name and description. */
  [field: string]: unknown;
}

/** What {@link trustContent} reads. */
export interface TrustContentInput {
  /** The workspace's connectors, as parsed from their files. */
  connectors: readonly Connector[];
  /**
   * The absolute path each program command resolves to on this machine,
   * by command as written. The launcher resolves it from `PATH`; the core
   * can't. A command missing from the map is kept as written only.
   */
  commandPaths?: ReadonlyMap<string, string>;
}

/**
 * Builds the trust content of a workspace's connectors.
 *
 * - **stdio:** the command (and the absolute path it resolves to), the
 *   arguments as a list, the working folder relative to the workspace,
 *   and every environment variable with its value as written: `${HOME}`
 *   stays `${HOME}`. Secret variables show only the secret's name.
 * - **http:** the full URL, normalised (see {@link trustUrl}), and every
 *   header.
 * - **all:** the secret's name, the tool lists and `local`, plus any other
 *   field as written.
 *
 * @example
 * trustContent({ connectors: [mailConnector] });
 * // { connectors: [{ id: "mail", transport: "stdio", settings: { command: "npx", args: [...], cwd: ".", env: {}, secretEnv: {} }, ... }] }
 */
export function trustContent(input: TrustContentInput): TrustContent {
  const commandPaths = input.commandPaths ?? new Map<string, string>();
  const connectors = input.connectors
    .map((connector) => connectorContent(connector, commandPaths))
    .sort((left, right) => compareText(left.id, right.id));
  return { connectors };
}

/** Shows a secret by name only. A secret's value never goes into the content. */
export function secretReference(name: string): string {
  return `‹secret ${name}›`;
}

function connectorContent(
  connector: Connector,
  commandPaths: ReadonlyMap<string, string>,
): ConnectorTrustContent {
  const fields: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(connector)) {
    if (!labelFields.has(field)) {
      fields[field] = value;
    }
  }
  const secret =
    connector.secret === undefined ? {} : { secret: secretReference(connector.secret) };
  const { kind, settings } = transportContent(connector.transport, commandPaths);
  return {
    ...fields,
    ...secret,
    tools: toolsContent(connector.tools),
    id: connector.id,
    transport: kind,
    settings,
  };
}

function transportContent(
  transport: Connector["transport"],
  commandPaths: ReadonlyMap<string, string>,
): { kind: string; settings: Record<string, unknown> } {
  if ("stdio" in transport) {
    const { stdio } = transport;
    const path = commandPaths.get(stdio.command);
    const settings: Record<string, unknown> = {
      ...stdio,
      command: stdio.command,
      args: [...stdio.args],
      cwd: posixPath.normalize(stdio.cwd ?? "."),
      env: { ...stdio.env },
      secretEnv: mapValues(stdio.secretEnv ?? {}, secretReference),
      ...(path === undefined ? {} : { path }),
    };
    return { kind: "stdio", settings };
  }
  if ("http" in transport) {
    const { http } = transport;
    return {
      kind: "http",
      settings: { ...http, url: trustUrl(http.url), headers: { ...http.headers } },
    };
  }
  if ("google" in transport) {
    return { kind: "google", settings: { ...transport.google } };
  }
  return unknownTransport(transport);
}

/**
 * A transport the schema doesn't know yet: its key names the kind and its
 * settings are kept as written, so it is still covered.
 */
function unknownTransport(transport: object): { kind: string; settings: Record<string, unknown> } {
  const [kind, settings] = Object.entries(transport)[0] ?? ["unknown", {}];
  return { kind, settings: { value: settings } };
}

function toolsContent(tools: Connector["tools"]): Record<string, unknown> {
  const allow = tools.allow === undefined ? {} : { allow: sorted(tools.allow) };
  return { ...tools, approve: sorted(tools.approve), ...allow };
}

function mapValues(
  record: Readonly<Record<string, string>>,
  map: (value: string) => string,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = map(value);
  }
  return result;
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort(compareText);
}

/** Compares by code unit, so the order is the same on every machine and locale. */
function compareText(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}
