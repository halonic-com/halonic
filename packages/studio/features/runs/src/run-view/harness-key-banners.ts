// The failed banners for a sandboxed harness agent's provider key (HAL-13795, Noah's C503 M2 and
// M3 on HAL-14914). Studio stops the run before the bridge opens, naming the cause, so the page
// says what happened and what fixes it rather than "Halonic can't tell the cause yet":
// - `harness-host.no-key`: the key's secret holds no value. R1's agent form with **Add key**.
// - `studio.harness-base-url`: the provider has its own Base URL, which Studio's agent host can't
//   send calls to yet (HAL-13798). R17's shape: the reason, then the `halonic run` command.

import type { RunEvent, RunSummary } from "@halonicjs/events";
import { failureWords } from "../failure-words.ts";
import { providerNameOf } from "../provider-name.ts";
import { capitalised } from "../run-words.ts";
import { danger } from "./danger-banner.ts";
import type { RunBanner, RunPageContext } from "./run-page-model.ts";

/** The cause code `ProviderKeyServices` gives a key whose secret holds no value. */
const noKeyCode = "harness-host.no-key";

/** The cause code Studio gives a provider with its own Base URL. */
const baseUrlCode = "studio.harness-base-url";

/**
 * The banner for a run Studio stopped over its harness agent's provider key, or `undefined` for
 * any other run, or a cause without the provider it names, so the page keeps its other banners.
 *
 * @param log The run's log, for the agent that started last; the Base URL banner waits for it,
 *   since its cause doesn't name the agent.
 * @param phone Whether the page is a phone's, which can't open Models or a terminal, so the fix
 *   becomes a line saying to do it on the computer (microcopy 15.3).
 */
export function harnessKeyBanner(
  summary: RunSummary,
  log: readonly RunEvent[] | undefined,
  context: RunPageContext,
  phone: boolean,
): RunBanner | undefined {
  const detail = summary.cause?.detail ?? {};
  const providerId = detail["provider"];
  if (providerId === undefined) {
    return undefined;
  }
  const provider = providerNameOf(providerId, context.providerName);
  switch (summary.cause?.code) {
    case noKeyCode:
      return noKey(provider, detail, context, phone);
    case baseUrlCode:
      return log === undefined ? undefined : baseUrl(provider, summary, log, context, phone);
    default:
      return undefined;
  }
}

/** R1's agent form: **Add key** opens Models, then **Run again**; a phone says to fix it there. */
function noKey(
  provider: string,
  detail: Readonly<Record<string, string>>,
  context: RunPageContext,
  phone: boolean,
): RunBanner {
  const agentId = detail["agent"];
  const agent =
    agentId === undefined ? failureWords.theAgent.toLowerCase() : nameOf(agentId, context);
  const harness = detail["harness"] ?? "";
  const program = failureWords.harnessNames[harness] ?? capitalised(harness);
  const line = failureWords.harnessNoKey(provider, agent, program);
  return phone
    ? danger([line, failureWords.fixOnComputer(failureWords.modelsPlace)])
    : danger([line], { fixes: [{ kind: "open-models", label: failureWords.addKey }] });
}

/**
 * The reason, then the command that runs the workflow where the key can go, with **Copy
 * command**. Running again in Studio would stop the same way, so there's no **Run again**.
 */
function baseUrl(
  provider: string,
  summary: RunSummary,
  log: readonly RunEvent[],
  context: RunPageContext,
  phone: boolean,
): RunBanner {
  const started = log.findLast(
    (event): event is Extract<RunEvent, { type: "agent.started" }> =>
      event.type === "agent.started" && event.parent === undefined,
  );
  const agent = started === undefined ? failureWords.theAgent : nameOf(started.agent, context);
  const line = failureWords.harnessBaseUrl(agent, provider);
  if (phone) {
    return danger([line, failureWords.runOnComputer], { noRunAgain: true });
  }
  const command = `halonic run ${summary.workflowId}`;
  return danger([line, failureWords.runInTerminal, command], {
    fixes: [{ kind: "copy-command", command }],
    noRunAgain: true,
  });
}

/** An agent's name as its file says, or its id when the workspace has no such agent. */
function nameOf(agentId: string, context: RunPageContext): string {
  return context.agentName?.(agentId) ?? agentId;
}
