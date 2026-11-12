import {
  type ConnectorPin,
  type ListedToolFingerprint,
  type ListedToolText,
  listedToolFingerprintPattern,
  type ToolApproval,
  type ToolApprovalKey,
  type ToolServer,
  type WaitingVersion,
  type WrittenDigest,
} from "@halonicjs/ports";
import { isPlainObject } from "@halonicjs/std";

/**
 * The format of the files this version of Halonic writes. A file with a
 * higher one comes from a newer Halonic: it is never read as an approval and
 * never overwritten.
 */
export const fileFormat = 1;

/** What a stored file holds, as this version of Halonic understands it. */
export type Read<T> =
  | { kind: "read"; value: T }
  | { kind: "damaged"; problem: string }
  | { kind: "newer"; problem: string };

const writtenDigestPattern = /^sha256:[0-9a-f]{64}$/u;

/** A listed fingerprint in a version this Halonic doesn't know yet, such as `htl2:`. */
const newerFingerprintPattern = /^htl(?!1:)\d+:/u;

/**
 * An approval's file text: the file format first, then the key, each part
 * in a fixed order, as two-space JSON with a final line break. A read
 * compares the file with this text, so a file holding a key twice or a key
 * Halonic doesn't write is never believed.
 */
export function formatApproval(approval: ToolApproval): string {
  const { location, source, name, server, fingerprint, tool, approvedAt } = approval;
  const record = {
    format: fileFormat,
    location,
    source,
    name,
    server: serverFields(server),
    fingerprint,
    tool: { name: tool.name, description: tool.description, parameters: tool.parameters },
    approvedAt,
  };
  return `${JSON.stringify(record, null, 2)}\n`;
}

/** Reads an approval file's text for `key`, strictly. */
export function readApproval(key: ToolApprovalKey, text: string): Read<ToolApproval> {
  const record = parseRecord(text);
  if (record.kind !== "read") return record;
  const { fingerprint } = record.value;
  if (typeof fingerprint === "string" && newerFingerprintPattern.test(fingerprint)) {
    return { kind: "newer", problem: `its fingerprint is ${fingerprint.split(":")[0]}:` };
  }
  const approval = approvalFrom(record.value);
  if (typeof approval === "string") return { kind: "damaged", problem: approval };
  if (
    approval.location !== key.location ||
    approval.source !== key.source ||
    approval.name !== key.name
  ) {
    return { kind: "damaged", problem: "it is an approval for another tool" };
  }
  if (formatApproval(approval) !== text) return notAsWritten;
  return { kind: "read", value: approval };
}

/**
 * The approval in `value` with its parts in Halonic's order, or what is
 * wrong with it. The store checks an approval with it before writing, so it
 * never writes one it couldn't read back.
 */
export function approvalFrom(value: Record<string, unknown>): ToolApproval | string {
  const { location, source, name, server, fingerprint, tool, approvedAt } = value;
  if (typeof location !== "string" || typeof source !== "string" || typeof name !== "string") {
    return "its location, source or name isn't text";
  }
  if (typeof fingerprint !== "string" || !listedToolFingerprintPattern.test(fingerprint)) {
    return "its fingerprint isn't htl1: and 64 lowercase hex digits";
  }
  const toolServer = serverFrom(server);
  if (toolServer === null) return "its server address isn't one Halonic writes";
  const toolText = toolFrom(tool);
  if (toolText === null) return "its tool isn't a name, a description and parameters";
  if (typeof approvedAt !== "string" || Number.isNaN(Date.parse(approvedAt))) {
    return "its approval time isn't a date";
  }
  return {
    location,
    source,
    name,
    server: toolServer,
    fingerprint: fingerprint as ListedToolFingerprint,
    tool: toolText,
    approvedAt,
  };
}

/** The waiting versions of one source, as the file text `readWaiting` reads. */
export function formatWaiting(
  key: Omit<ToolApprovalKey, "name">,
  waiting: ReadonlyMap<string, readonly WaitingVersion[]>,
): string {
  const record = {
    format: fileFormat,
    location: key.location,
    source: key.source,
    tools: [...waiting].map(([name, versions]) => ({
      name,
      versions: versions.map(({ fingerprint, firstSeenAt }) => ({ fingerprint, firstSeenAt })),
    })),
  };
  return `${JSON.stringify(record, null, 2)}\n`;
}

/** Reads a waiting file's text for one source, strictly. */
export function readWaiting(
  key: Omit<ToolApprovalKey, "name">,
  text: string,
): Read<Map<string, WaitingVersion[]>> {
  const record = parseRecord(text);
  if (record.kind !== "read") return record;
  const { location, source, tools } = record.value;
  if (location !== key.location || source !== key.source) {
    return { kind: "damaged", problem: "it is for another source" };
  }
  if (!Array.isArray(tools)) return { kind: "damaged", problem: "it holds no list of tools" };
  const waiting = new Map<string, WaitingVersion[]>();
  for (const tool of tools) {
    const name = isPlainObject(tool) ? tool["name"] : undefined;
    const versions = isPlainObject(tool) ? versionsFrom(tool["versions"]) : null;
    if (typeof name !== "string" || versions === null || waiting.has(name)) {
      return { kind: "damaged", problem: "a tool in it isn't a unique name with its versions" };
    }
    waiting.set(name, versions);
  }
  if (formatWaiting(key, waiting) !== text) return notAsWritten;
  return { kind: "read", value: waiting };
}

const notAsWritten: Read<never> = {
  kind: "damaged",
  problem:
    "it isn't written as Halonic writes it, so it may hold a key twice or one Halonic doesn't know",
};

/** The JSON object in a file, once its format is known to be this one. */
function parseRecord(text: string): Read<Record<string, unknown>> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { kind: "damaged", problem: "it isn't JSON" };
  }
  if (!isPlainObject(value)) return { kind: "damaged", problem: "it isn't a JSON object" };
  const { format } = value;
  if (Number.isSafeInteger(format) && (format as number) > fileFormat) {
    return { kind: "newer", problem: `its file format is ${format}` };
  }
  if (format !== fileFormat) return { kind: "damaged", problem: "it has no file format" };
  return { kind: "read", value };
}

function serverFields(server: ToolServer): ToolServer {
  switch (server.kind) {
    case "http":
      return { kind: server.kind, url: server.url, headers: server.headers };
    case "stdio":
      return {
        kind: server.kind,
        command: server.command,
        args: server.args,
        pin: server.pin === null ? null : pinFields(server.pin),
        cwd: server.cwd,
        env: server.env,
        secretEnv: server.secretEnv,
        ...(server.inheritEnv === undefined ? {} : { inheritEnv: [...server.inheritEnv] }),
      };
    case "integration":
      return {
        kind: server.kind,
        id: server.id,
        version: server.version,
        settings: server.settings,
      };
  }
}

function pinFields(pin: ConnectorPin): ConnectorPin {
  return {
    registry: pin.registry,
    registryUrl: pin.registryUrl,
    package: pin.package,
    version: pin.version,
  };
}

function serverFrom(value: unknown): ToolServer | null {
  if (!isPlainObject(value)) return null;
  switch (value["kind"]) {
    case "http": {
      const { url, headers } = value;
      if (typeof url !== "string" || !isWrittenDigest(headers)) return null;
      return { kind: "http", url, headers };
    }
    case "stdio":
      return stdioServerFrom(value);
    case "integration": {
      const { id, version, settings } = value;
      if (typeof id !== "string" || typeof version !== "string" || !isPlainObject(settings)) {
        return null;
      }
      return { kind: "integration", id, version, settings };
    }
    default:
      return null;
  }
}

/** A stored `stdio` address, or `null` when a field isn't what it should be. */
function stdioServerFrom(value: Record<string, unknown>): ToolServer | null {
  const { command, args, pin, cwd, env, secretEnv, inheritEnv } = value;
  const connectorPin = pin === null ? null : pinFrom(pin);
  if (
    typeof command !== "string" ||
    !isTextList(args) ||
    connectorPin === undefined ||
    typeof cwd !== "string" ||
    !isWrittenDigest(env) ||
    !isWrittenDigest(secretEnv) ||
    (inheritEnv !== undefined && !isTextList(inheritEnv))
  ) {
    return null;
  }
  const server: ToolServer = {
    kind: "stdio",
    command,
    args,
    pin: connectorPin,
    cwd,
    env,
    secretEnv,
  };
  // Only when stored, so an address written before `inheritEnv` reads as it was.
  return inheritEnv === undefined ? server : { ...server, inheritEnv };
}

/** The pin in `value`, or `undefined` when it isn't one. */
function pinFrom(value: unknown): ConnectorPin | undefined {
  if (!isPlainObject(value)) return undefined;
  const { registry, registryUrl, package: name, version } = value;
  if (
    (registry !== "npm" && registry !== "pypi") ||
    typeof registryUrl !== "string" ||
    typeof name !== "string" ||
    typeof version !== "string"
  ) {
    return undefined;
  }
  return { registry, registryUrl, package: name, version };
}

function toolFrom(value: unknown): ListedToolText | null {
  if (!isPlainObject(value)) return null;
  const { name, description, parameters } = value;
  if (typeof name !== "string" || typeof description !== "string" || !isPlainObject(parameters)) {
    return null;
  }
  return { name, description, parameters };
}

function versionsFrom(value: unknown): WaitingVersion[] | null {
  if (!Array.isArray(value)) return null;
  const versions: WaitingVersion[] = [];
  for (const version of value) {
    if (!isPlainObject(version)) return null;
    const { fingerprint, firstSeenAt } = version;
    if (
      typeof fingerprint !== "string" ||
      !listedToolFingerprintPattern.test(fingerprint) ||
      typeof firstSeenAt !== "string" ||
      Number.isNaN(Date.parse(firstSeenAt))
    ) {
      return null;
    }
    versions.push({ fingerprint: fingerprint as ListedToolFingerprint, firstSeenAt });
  }
  return versions;
}

function isWrittenDigest(value: unknown): value is WrittenDigest | null {
  return value === null || (typeof value === "string" && writtenDigestPattern.test(value));
}

function isTextList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
