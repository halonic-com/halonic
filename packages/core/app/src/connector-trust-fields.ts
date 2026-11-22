import type { ConnectorTrustContent } from "@halonicjs/workspace";

/**
 * What any connector's row in the trust check shows beyond its address or command, read from its
 * trust content and not yet escaped: its tool lists, an HTTP connector's headers and every field
 * the trust content keeps under `unknown`. They are all in the fingerprint, so the check shows
 * them too. The CLI's `halonic trust` and Studio's trust check both build these lines from it.
 */
export interface ConnectorTrustFields {
  /** `tools.allow`: the only tools offered to agents, sorted, or `undefined` when it offers every tool. */
  readonly offeredTools: readonly string[] | undefined;
  /** `tools.approve`: the tools that ask a person first, sorted, or `all` for every tool. */
  readonly asksFirst: "all" | readonly string[];
  /** `tools.read`: the tools that run without asking, sorted. */
  readonly withoutAsking: readonly string[];
  /** An HTTP connector's headers as written, one `Name: value` each, sorted by name. */
  readonly headers: readonly string[];
  /**
   * The fields the schema doesn't know, one `key.path: value` each, the value as JSON: the
   * connector's own, then its transport's, then its tool lists'.
   */
  readonly otherSettings: readonly string[];
}

/**
 * The fields `tools` may hold that {@link connectorTrustFields} shows on their own line. The
 * trust content keeps `read` under `tools.unknown`, so it isn't listed again with the others.
 */
const shownToolFields = new Set(["read"]);

/**
 * The fields of a connector's trust row beyond its address or command.
 *
 * @example
 * connectorTrustFields(connector).headers; // ["X-Team: acme"]
 */
export function connectorTrustFields(connector: ConnectorTrustContent): ConnectorTrustFields {
  const { tools, settings } = connector;
  const toolsUnknown = record(tools["unknown"]);
  const allow = tools["allow"];
  const approve = tools["approve"];
  return {
    offeredTools: Array.isArray(allow) ? strings(allow) : undefined,
    asksFirst: approve === "all" ? "all" : strings(approve),
    withoutAsking: strings(toolsUnknown["read"]),
    headers:
      connector.transport === "http"
        ? sortedEntries(record(settings["headers"])).map(
            ([name, value]) =>
              `${name}: ${typeof value === "string" ? value : JSON.stringify(value)}`,
          )
        : [],
    otherSettings: [
      ...keyLines([], record(connector.unknown)),
      ...keyLines(["transport", connector.transport], record(settings["unknown"])),
      ...keyLines(
        ["tools"],
        Object.fromEntries(
          Object.entries(toolsUnknown).filter(([field]) => !shownToolFields.has(field)),
        ),
      ),
    ],
  };
}

/** One `key.path: value` line per field, in name order, the value as JSON. */
function keyLines(path: readonly string[], fields: Record<string, unknown>): string[] {
  return sortedEntries(fields).map(
    ([field, value]) => `${[...path, field].join(".")}: ${JSON.stringify(value) ?? String(value)}`,
  );
}

function sortedEntries(fields: Record<string, unknown>): [string, unknown][] {
  return Object.entries(fields).sort(([first], [second]) => first.localeCompare(second, "en"));
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string").sort() : [];
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}
