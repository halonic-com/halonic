import { useMemo } from "react";
import {
  type AgentRef,
  type AgentSettings,
  type AgentsHost,
  type AgentToolList,
  type AgentToolOption,
  agentToolLists,
} from "../api.ts";
import { type Load, useLoad } from "../page/use-load.ts";
import { modelCheck } from "./model-page.tsx";

/**
 * How many errors the agent's file has on each Configuration page that can have one: the Model
 * page's model the hub has no alias for, and the Tools page's items the hub can't use.
 */
export interface ConfigurationErrors {
  readonly model: number;
  readonly tools: number;
}

/** No errors, also while what the count needs is still being read. */
export const noConfigurationErrors: ConfigurationErrors = { model: 0, tools: 0 };

type ToolOptions = Readonly<Record<AgentToolList, readonly AgentToolOption[]>>;

/**
 * Counts the errors each page shows for what the agent's file says, by the pages' own checks. A
 * page whose list can't be read counts none, as the page then can't say an item is missing.
 *
 * @example
 * configurationErrors(settings, ["fast"], undefined); // { model: 1, tools: 0 } for model "smrt"
 */
export function configurationErrors(
  settings: AgentSettings,
  aliases: readonly string[] | undefined,
  toolOptions: ToolOptions | undefined,
): ConfigurationErrors {
  const model = aliases !== undefined && modelCheck(settings.model ?? "", aliases) !== null ? 1 : 0;
  const tools =
    toolOptions === undefined
      ? 0
      : agentToolLists.reduce(
          (sum, list) =>
            sum +
            settings[list].filter((id) => !toolOptions[list].some((option) => option.id === id))
              .length,
          0,
        );
  return { model, tools };
}

/** The sum of the pages' errors, for the counter on the Configuration tab. */
export function errorTotal(errors: ConfigurationErrors): number {
  return errors.model + errors.tools;
}

/** The value of a load once it is read; `undefined` while it is read or when it failed. */
const readValue = <Value>(load: Load<Value>): Value | undefined =>
  load.kind === "ready" ? load.value : undefined;

/**
 * The agent's Configuration errors (`agents.configuration.error-counts`), read again when a file
 * changes, so the counters show before the person opens the page that has them.
 */
export function useConfigurationErrors(
  host: AgentsHost,
  { hubId, id }: AgentRef,
  settings: Load<AgentSettings>,
  aliases: Load<readonly string[]>,
): ConfigurationErrors {
  const toolsSource = useMemo(
    () => ({
      fetch: () => host.toolOptions({ hubId, id }),
      subscribe: (onChange: () => void) => host.subscribe(onChange),
    }),
    [host, hubId, id],
  );
  const toolOptions = useLoad<ToolOptions>(toolsSource);
  const read = readValue(settings);
  if (read === undefined) return noConfigurationErrors;
  return configurationErrors(read, readValue(aliases), readValue(toolOptions.load));
}
