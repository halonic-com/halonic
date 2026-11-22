// The lines every connector's row in the trust check has under it when its file sets them: its
// tool lists, an HTTP connector's headers and the fields the schema doesn't know, with the CLI's
// labels (HAL-16336).

import { connectorTrustFields } from "@halonicjs/app";
import type { TrustRowView } from "@halonicjs/studio-feature-workspace";
import type { ConnectorTrustContent } from "@halonicjs/workspace";
import { withoutAsking } from "./agent-trust-rows.ts";

type TrustLine = TrustRowView["lines"][number];

/**
 * **Offered tools** when `tools.allow` limits them, **Asks first** with the tools that ask a
 * person first or "every tool", **Without asking** with the tools that don't, then **Headers**
 * and **Other settings**, one entry per line. The fingerprint covers all of them, so the check
 * shows them (`app.connector-trust-fields`). Tool names and entries are code, so they show in mono.
 */
export function connectorLines(connector: ConnectorTrustContent): TrustLine[] {
  const fields = connectorTrustFields(connector);
  const names = fields.asksFirst === "all" ? [] : fields.asksFirst;
  return [
    ...(fields.offeredTools === undefined
      ? []
      : [["Offered tools", fields.offeredTools.join(", "), "code"] as const]),
    ...(fields.asksFirst === "all" ? [["Asks first", "every tool"] as const] : []),
    ...(names.length === 0 ? [] : [["Asks first", names.join(", "), "code"] as const]),
    ...(fields.withoutAsking.length === 0
      ? []
      : [[withoutAsking, fields.withoutAsking.join(", "), "code"] as const]),
    ...entryLines("Headers", fields.headers),
    ...entryLines("Other settings", fields.otherSettings),
  ];
}

/** The label and the first entry, then every other entry under it. */
function entryLines(label: string, entries: readonly string[]): TrustLine[] {
  return entries.map((entry, index) => [index === 0 ? label : "", entry, "code"] as const);
}
