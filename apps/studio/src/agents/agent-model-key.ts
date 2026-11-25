import type { Agent } from "@halonicjs/format";
import type { MissingModelKey } from "@halonicjs/studio-feature-agents/api";
import { filesOf, type LoadedWorkspace, resolveModel } from "@halonicjs/workspace";
import type { HasKey } from "../assistant/chat-models.ts";
import { defaultModelOf } from "./agent-reads.ts";

/**
 * The agent's model when its provider needs a key that isn't stored on this computer (states H19),
 * as the Build chat's Model menu finds it for an alias. The agent's own model, else its hub's or
 * the workspace's default. A program such as Claude Code signs in on its own, so only Halonic's
 * loop asks; a model or provider the workspace doesn't have is the workspace checks' to report.
 */
export async function missingModelKeyOf(
  workspace: LoadedWorkspace,
  hubId: string,
  agent: Pick<Agent, "model" | "harness">,
  hasKey: HasKey,
): Promise<MissingModelKey | undefined> {
  if ((agent.harness ?? "halonic") !== "halonic") return undefined;
  const model = agent.model ?? defaultModelOf(workspace, hubId);
  if (model === undefined) return undefined;
  const target = resolveModel(workspace, hubId, model);
  if (target === undefined) return undefined;
  const provider = filesOf(workspace, "provider").find(
    (file) => file.value.id === target.provider,
  )?.value;
  if (provider?.secret === undefined || (await hasKey(provider.secret))) return undefined;
  return { model, provider: provider.name ?? provider.id, secretName: provider.secret };
}
