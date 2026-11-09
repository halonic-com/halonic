import type { Connector } from "@halonicjs/format";
import { posixPath } from "@halonicjs/std";
import { trustUrl } from "./trust-url.ts";

/**
 * Connector fields that {@link connectorContent} reads itself. `name` and
 * `description` only label it: they decide nothing, so they stay out.
 */
const connectorFields = new Set([
  "version",
  "id",
  "name",
  "description",
  "transport",
  "secret",
  "tools",
  "local",
]);

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
  /** Every connector that can be trusted, sorted by id. */
  connectors: ConnectorTrustContent[];
  /**
   * Connectors that can't be trusted at all, sorted by id. Only there when
   * there are some. A workspace with any can't be fingerprinted, so none of
   * its connectors can be trusted or started until the file is fixed.
   */
  refused?: RefusedConnector[];
}

/**
 * One connector's part of the trust content. The known fields are
 * normalised; every other field of the connector file is kept as written
 * under `unknown`, so a field added to the schema later can't slip past the
 * fingerprint, and can't take the place of a known field either.
 */
export interface ConnectorTrustContent {
  version?: unknown;
  id: string;
  /** `stdio`, `http` or `google`, so switching transport is a change. */
  transport: string;
  /** The transport's settings, normalised. */
  settings: Record<string, unknown>;
  /** The secret the connector uses, by name only: `‹secret NAME›`. */
  secret?: string;
  /** The tool lists, with their names sorted. */
  tools: Record<string, unknown>;
  local?: boolean;
  /** Every other field of the connector file, except its name and description. */
  unknown?: Record<string, unknown>;
}

/** A connector that can't be trusted, and why. Its settings stay out, as they may hold a password. */
export interface RefusedConnector {
  id: string;
  /** Why, such as "the URL has user info". */
  reason: string;
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
 *   header. A connector whose URL `trustUrl` refuses goes in `refused`.
 * - **all:** the secret's name, the tool lists and `local`, plus any other
 *   field as written, under `unknown`.
 *
 * @example
 * trustContent({ connectors: [mailConnector] });
 * // { connectors: [{ id: "mail", transport: "stdio", settings: { command: "npx", args: [...], cwd: ".", env: {}, secretEnv: {} }, ... }] }
 */
export function trustContent(input: TrustContentInput): TrustContent {
  const commandPaths = input.commandPaths ?? new Map<string, string>();
  const connectors: ConnectorTrustContent[] = [];
  const refused: RefusedConnector[] = [];
  for (const connector of input.connectors) {
    const content = connectorContent(connector, commandPaths);
    if ("reason" in content) {
      refused.push(content);
    } else {
      connectors.push(content);
    }
  }
  connectors.sort((left, right) => compareText(left.id, right.id));
  refused.sort((left, right) => compareText(left.id, right.id));
  return refused.length === 0 ? { connectors } : { connectors, refused };
}

/** Shows a secret by name only. A secret's value never goes into the content. */
export function secretReference(name: string): string {
  return `‹secret ${name}›`;
}

function connectorContent(
  connector: Connector,
  commandPaths: ReadonlyMap<string, string>,
): ConnectorTrustContent | RefusedConnector {
  const transport = transportContent(connector.transport, commandPaths);
  if ("refused" in transport) {
    return { id: connector.id, reason: transport.refused };
  }
  const unknown = unknownFields(connector, connectorFields);
  return {
    ...("version" in connector ? { version: connector.version } : {}),
    id: connector.id,
    transport: transport.kind,
    settings: transport.settings,
    ...(connector.secret === undefined ? {} : { secret: secretReference(connector.secret) }),
    tools: toolsContent(connector.tools),
    ...(connector.local === undefined ? {} : { local: connector.local }),
    ...(unknown === undefined ? {} : { unknown }),
  };
}

type TransportContent = { kind: string; settings: Record<string, unknown> } | { refused: string };

function transportContent(
  transport: Connector["transport"],
  commandPaths: ReadonlyMap<string, string>,
): TransportContent {
  if ("stdio" in transport) {
    const { stdio } = transport;
    const path = commandPaths.get(stdio.command);
    const settings: Record<string, unknown> = {
      command: stdio.command,
      args: [...stdio.args],
      cwd: posixPath.normalize(stdio.cwd ?? "."),
      env: { ...stdio.env },
      secretEnv: mapValues(stdio.secretEnv ?? {}, secretReference),
      ...(path === undefined ? {} : { path }),
    };
    return { kind: "stdio", settings: withUnknown(settings, stdio, stdioFields) };
  }
  if ("http" in transport) {
    const { http } = transport;
    const url = trustUrl(http.url);
    if ("refused" in url) {
      return url;
    }
    const settings = { url: url.url, headers: { ...http.headers } };
    return { kind: "http", settings: withUnknown(settings, http, httpFields) };
  }
  if ("google" in transport) {
    const { google } = transport;
    const settings = { account: google.account, client: google.client };
    return { kind: "google", settings: withUnknown(settings, google, googleFields) };
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
  return withUnknown({ approve: sorted(tools.approve), ...allow }, tools, toolsFields);
}

const stdioFields = new Set(["command", "args", "env", "secretEnv", "cwd"]);
const httpFields = new Set(["url", "headers"]);
const googleFields = new Set(["account", "client"]);
const toolsFields = new Set(["allow", "approve"]);

/** Adds the fields of `source` that aren't in `known`, as written, under `unknown`. */
function withUnknown(
  content: Record<string, unknown>,
  source: object,
  known: ReadonlySet<string>,
): Record<string, unknown> {
  const unknown = unknownFields(source, known);
  return unknown === undefined ? content : { ...content, unknown };
}

/** The fields of `source` that aren't in `known`, or `undefined` when there are none. */
function unknownFields(
  source: object,
  known: ReadonlySet<string>,
): Record<string, unknown> | undefined {
  const unknown = Object.entries(source).filter(([field]) => !known.has(field));
  return unknown.length === 0 ? undefined : Object.fromEntries(unknown);
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
