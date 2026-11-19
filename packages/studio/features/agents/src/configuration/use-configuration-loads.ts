import { useMemo } from "react";
import type { AgentRef, AgentSettings, AgentsHost } from "../api.ts";
import { type Load, useLoad } from "../page/use-load.ts";

/** What an agent's Configuration reads, each read again when a file changes. */
export interface ConfigurationLoads {
  readonly settings: { readonly load: Load<AgentSettings>; readonly retry: () => void };
  /** The hub's model aliases, for the Model page. */
  readonly aliases: { readonly load: Load<readonly string[]>; readonly retry: () => void };
  /** The model an agent without one runs on; `undefined` while it is read or when there is none. */
  readonly defaultModel: string | undefined;
}

/**
 * Reads what an agent's Configuration shows, for the agent page and for a subagent's card, which
 * shows the subagent's Configuration in the same panel.
 */
export function useConfigurationLoads(
  host: AgentsHost,
  { hubId, id }: AgentRef,
): ConfigurationLoads {
  const subscribe = useMemo(() => (onChange: () => void) => host.subscribe(onChange), [host]);
  const settingsSource = useMemo(
    () => ({ fetch: () => host.settings({ hubId, id }), subscribe }),
    [host, hubId, id, subscribe],
  );
  const aliasesSource = useMemo(
    () => ({ fetch: () => host.modelAliases({ hubId, id }), subscribe }),
    [host, hubId, id, subscribe],
  );
  const defaultModelSource = useMemo(
    () => ({ fetch: () => host.defaultModel(hubId), subscribe }),
    [host, hubId, subscribe],
  );
  const settings = useLoad<AgentSettings>(settingsSource);
  const aliases = useLoad<readonly string[]>(aliasesSource);
  const defaultModel = useLoad<string | undefined>(defaultModelSource);
  return {
    settings,
    aliases,
    defaultModel: defaultModel.load.kind === "ready" ? defaultModel.load.value : undefined,
  };
}
