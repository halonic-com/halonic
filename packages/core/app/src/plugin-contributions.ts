// What trusted plugins give the rest of Halonic, as `app.plugin-contributions`
// asks: their declared tools, by part and with the plugin's trust grant, and
// their `ui` as plain data for Studio (P2 plan section 1). A plugin that isn't
// trusted gives nothing.

import type { IntegrationTool, PluginUi } from "@halonicjs/format";
import type { TrustGrant } from "@halonicjs/ports";
import type { PluginEntry, ReadPlugin } from "./plugin-service.ts";
import { localPart, type PluginPart } from "./plugin-trust-content.ts";

/**
 * The tools one part of a trusted plugin declares: its backend, or one local
 * tool. They are what the person reviewed when they trusted the plugin.
 * The tool's parameters come from the part itself, the backend's code or the
 * local tool's listing, when it starts; the tool listing then offers only
 * these tools, with this `risk` and `untrusted`, and `trust` as its grant.
 */
export interface PluginToolSet {
  /** The plugin's id. */
  readonly plugin: string;
  readonly part: PluginPart;
  /** The tools in manifest order, as the manifest declares them. */
  readonly declared: readonly IntegrationTool[];
  /** The plugin's trust grant. */
  readonly trust: TrustGrant;
}

/** What Studio draws for one trusted plugin: data only, no plugin code runs in Studio. */
export interface PluginUiContribution {
  /** The plugin's id. */
  readonly plugin: string;
  /** The plugin's name, for the panel and the settings page. It is untrusted text. */
  readonly name: string;
  readonly ui: PluginUi;
}

type TrustedPlugin = ReadPlugin & { readonly status: "trusted" };

/**
 * The declared tools of every trusted plugin, a set for each part that
 * declares any: the backend first, then the local tools in manifest order.
 *
 * @param entries - what `PluginService.load` gave
 */
export function trustedPluginTools(entries: readonly PluginEntry[]): PluginToolSet[] {
  return trusted(entries).flatMap((entry) => {
    const { plugin, grant } = entry;
    const parts: { part: PluginPart; tools: readonly IntegrationTool[] }[] = [
      { part: "backend", tools: plugin.backend?.tools ?? [] },
      ...(plugin.localTools ?? []).map((tool) => ({ part: localPart(tool), tools: tool.tools })),
    ];
    return parts
      .filter(({ tools }) => tools.length > 0)
      .map(({ part, tools }) => ({ plugin: plugin.id, part, declared: tools, trust: grant }));
  });
}

/**
 * The `ui` of every trusted plugin that has one, in the order of `entries`.
 *
 * @param entries - what `PluginService.load` gave
 */
export function trustedPluginUi(entries: readonly PluginEntry[]): PluginUiContribution[] {
  return trusted(entries).flatMap(({ plugin }) =>
    plugin.ui === undefined ? [] : [{ plugin: plugin.id, name: plugin.name, ui: plugin.ui }],
  );
}

function trusted(entries: readonly PluginEntry[]): TrustedPlugin[] {
  return entries.filter((entry): entry is TrustedPlugin => entry.status === "trusted");
}
