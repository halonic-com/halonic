import type { HostSettings } from "@halonicjs/app";
import type { ChatAgent, ModelOption, ModelProblem } from "@halonicjs/studio-feature-assistant/api";
import { filesOf, type LoadedWorkspace, modelAliases, providerIsLocal } from "@halonicjs/workspace";
import { assistantModelOf, deviceModelOf } from "./workspace-assistant-model.ts";

/** Whether a key is stored on this computer under the secret's name; the key itself is never read. */
export type HasKey = (secretName: string) => Promise<boolean>;

/**
 * The Settings › Assistant providers by name, for "Needs a key for Anthropic". Settings keeps its
 * own labels inside its feature; any other type is named as it is.
 */
const deviceProviderNames: Readonly<Record<string, string>> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  gemini: "Gemini",
};

/**
 * A Build chat's Model menu (flow-assistant 5.2): the Assistant model first when one is set, then
 * the workspace's aliases by name. A model that can't be used now is listed with its reason,
 * never left out (component specs 15.3).
 */
export async function modelOptionsOf(
  workspace: LoadedWorkspace,
  settings: Pick<HostSettings, "get">,
  hasKey: HasKey,
): Promise<ModelOption[]> {
  const options: ModelOption[] = [];
  const own = assistantModelOf(workspace);
  const device = deviceModelOf(settings);
  if (own !== null) {
    const problem = await aliasProblem(workspace, own, hasKey);
    options.push({ model: { kind: "assistant" }, label: own, from: "workspace", problem });
  } else if (device !== undefined) {
    let problem: ModelProblem | null = null;
    if (isLocalOnly(workspace) && !device.local) {
      problem = { kind: "local-only", workspace: workspaceName(workspace) };
    } else if (device.secret !== undefined && !(await hasKey(device.secret))) {
      const provider = deviceProviderNames[device.type] ?? device.type;
      problem = { kind: "needs-key", provider, secretName: device.secret };
    }
    options.push({ model: { kind: "assistant" }, label: device.model, from: "settings", problem });
  }
  for (const name of [...modelAliases(workspace, null).keys()].sort()) {
    const problem = await aliasProblem(workspace, name, hasKey);
    options.push({ model: { kind: "alias", name }, label: name, from: "workspace", problem });
  }
  return options;
}

/**
 * Why an alias can't be used now: a cloud model in a local-only workspace, or a provider whose key
 * isn't stored. An alias or provider the workspace doesn't have is the workspace checks' to report.
 */
async function aliasProblem(
  workspace: LoadedWorkspace,
  name: string,
  hasKey: HasKey,
): Promise<ModelProblem | null> {
  const alias = modelAliases(workspace, null).get(name);
  if (alias === undefined) return null;
  const provider = filesOf(workspace, "provider").find(
    (file) => file.value.id === alias.provider,
  )?.value;
  if (provider === undefined) return null;
  if (isLocalOnly(workspace) && !providerIsLocal(provider)) {
    return { kind: "local-only", workspace: workspaceName(workspace) };
  }
  if (provider.secret !== undefined && !(await hasKey(provider.secret))) {
    return {
      kind: "needs-key",
      provider: provider.name ?? provider.id,
      secretName: provider.secret,
    };
  }
  return null;
}

/** The workspace's agents in hubs for the Chat with menu (flow-assistant 5.3), by name. */
export function chatAgentsOf(workspace: LoadedWorkspace): ChatAgent[] {
  return filesOf(workspace, "agent")
    .flatMap((file): ChatAgent[] => {
      if (file.hub === null) return [];
      const { id, name, description, model, character } = file.value;
      return [
        {
          kind: `agent:${file.hub}/${id}`,
          name,
          description,
          model: model ?? "default",
          colors: character?.colors,
        },
      ];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The hub and id an agent chat's kind names, or `undefined` for a Build chat. */
export function agentOfKind(kind: string): { hubId: string; agentId: string } | undefined {
  if (!kind.startsWith("agent:")) return undefined;
  const ref = kind.slice("agent:".length);
  const slash = ref.lastIndexOf("/");
  if (slash <= 0) return undefined;
  return { hubId: ref.slice(0, slash), agentId: ref.slice(slash + 1) };
}

function isLocalOnly(workspace: LoadedWorkspace): boolean {
  return filesOf(workspace, "workspace")[0]?.value.privacy.localOnly === true;
}

function workspaceName(workspace: LoadedWorkspace): string {
  return filesOf(workspace, "workspace")[0]?.value.name ?? "This workspace";
}
