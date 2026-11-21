// Which harness agents reach a model that searches the web by itself. The
// bridge lets a harness agent call the model its alias resolves to, by
// design, so such a model's search happens at the provider, outside
// Halonic's tools and approvals. `doctor` warns about it; it never blocks,
// as the choice of model is the person's (HAL-13603).

import { filesOf, type LoadedWorkspace, resolveModel } from "@halonicjs/workspace";

/** A harness agent whose model alias names a model its provider file lists in `searchesWeb`. */
export interface WebSearchingAgent {
  /** The agent's name as a person reads it, such as "Writer". */
  agent: string;
  /** The alias the agent's `model` names, such as "research". */
  alias: string;
  /** The model the alias resolves to, such as "perplexity/sonar". */
  model: string;
  /** The provider's name as a person reads it, its `name` or else its id, such as "OpenRouter". */
  provider: string;
}

/**
 * The harness agents of the workspace whose model searches the web by
 * itself (requirement `app.doctor-harness-web-search`), in file order.
 *
 * Only what reaches the bridge counts, as `harnessModelAccess` decides it:
 * an agent whose harness isn't Halonic's own and whose `model` is an alias
 * its hub can use. A `provider/model` name or a name the program knows
 * itself never goes through the bridge, and neither do the alias's
 * fallbacks. The alias's `model` must match an entry of its provider's
 * `searchesWeb` exactly.
 *
 * @example
 * webSearchingAgents(workspace);
 * // [{ agent: "Writer", alias: "research", model: "perplexity/sonar", provider: "OpenRouter" }]
 */
export function webSearchingAgents(workspace: LoadedWorkspace): WebSearchingAgent[] {
  const providers = new Map(
    filesOf(workspace, "provider").map((file) => [file.value.id, file.value]),
  );
  return filesOf(workspace, "agent").flatMap(({ hub, value: agent }) => {
    if (agent.harness === undefined || agent.harness === "halonic") return [];
    if (agent.model === undefined || agent.model.includes("/")) return [];
    const target = resolveModel(workspace, hub, agent.model);
    if (target === undefined) return [];
    const provider = providers.get(target.provider);
    if (provider?.searchesWeb?.includes(target.model) !== true) return [];
    return [
      {
        agent: agent.name,
        alias: agent.model,
        model: target.model,
        provider: provider.name ?? provider.id,
      },
    ];
  });
}
