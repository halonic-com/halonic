// The tools the integration sheets bound to a hub's connectors declare, in the
// shape a run keeps them (`RunDefinitions.declaredTools` in the engine,
// requirement `workspace.declared-tools`).

import type { IntegrationTool } from "@halonicjs/format";
import type { HubDefinitions } from "./definitions.ts";
import type { LocalIntegrationInput } from "./trust-integrations.ts";

/** What a sheet declares about one tool that a run reads: its risk, and the noun and verb it logs. */
export type DeclaredToolEntry = Pick<IntegrationTool, "risk" | "noun" | "verb">;

/** The declared tools of every connector bound to a sheet, by connector id and then by tool name. */
export type DeclaredToolsByConnector = Readonly<
  Record<string, Readonly<Record<string, DeclaredToolEntry>>>
>;

/**
 * The tools declared by the sheet each of the hub's connectors is bound to: a
 * connector whose transport is `integration: { folder }` is bound to the
 * integration in `integrations/<folder>`. A connector with another
 * transport, or whose folder holds no integration in `integrations`, has no
 * entry, and its tools get no noun.
 *
 * Pass only integrations a person's trust covers: the host reads them
 * after the trust check, so a sheet that changed since it was approved never
 * gets here. Without trust, pass none.
 *
 * @param hub - the hub's definitions, from {@link definitionsOf}
 * @param integrations - the workspace's local integrations the trust check covered
 *
 * @example
 * declaredToolsOf(hub, integrations);
 * // { mail: { send_email: { risk: "send", noun: { one: "email", many: "emails" } } } }
 */
export function declaredToolsOf(
  hub: Pick<HubDefinitions, "connectors">,
  integrations: readonly LocalIntegrationInput[],
): DeclaredToolsByConnector {
  const entries: [string, Record<string, DeclaredToolEntry>][] = [];
  for (const connector of Object.values(hub.connectors)) {
    const { transport } = connector;
    if (!("integration" in transport)) continue;
    const folder = `integrations/${transport.integration.folder}`;
    const bound = integrations.find((integration) => integration.folder === folder);
    if (bound === undefined) continue;
    entries.push([connector.id, Object.fromEntries(bound.sheet.tools.map(declaredEntryOf))]);
  }
  // `fromEntries` defines each key, so a connector named "__proto__" stays one.
  return Object.fromEntries(entries);
}

function declaredEntryOf(tool: IntegrationTool): [string, DeclaredToolEntry] {
  return [
    tool.name,
    {
      risk: tool.risk,
      ...(tool.noun === undefined ? {} : { noun: tool.noun }),
      ...(tool.verb === undefined ? {} : { verb: tool.verb }),
    },
  ];
}
