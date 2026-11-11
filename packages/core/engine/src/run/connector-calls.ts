// Connector calls in workflow runs (HAL-1532). A run's turn hands over each
// connector call that can change things at the side-effect boundary: the
// "allow sending" check first, then the kernel records the call and its
// key, and only then does the engine make it, here.

import type { SendingSettings } from "@halonicjs/app";
import { type Agent, type Connector, needsApproval } from "@halonicjs/format";
import type { ConnectorClient } from "@halonicjs/ports";
import { isPlainObject } from "@halonicjs/std";
import type { EffectBoundary } from "../agent/run-tool-call.ts";
import { collectTurnTools, errorMessage } from "../agent/turn-tools.ts";
import type { CallToolEffect, ToolResult } from "../kernel/decide-types.ts";
import { brokeOff } from "../kernel/requested-effect.ts";

/**
 * What runs need to reach connectors. Without it, a run's model call
 * offers no connector's tools, and a `call-tool` effect fails the run.
 */
export interface RunConnectorCalls {
  /** The workspace's resolved real path, which with a connector's id keys its settings. */
  readonly location: string;
  /**
   * Whether each connector may send. Only the read side of the settings, so
   * nothing on a call's path can switch sending on.
   */
  readonly sending: SendingSettings;
  /**
   * Hears the store's error when a connector's settings can't be read, for
   * the host to log and show the person. It never reaches the model: it can
   * name paths in the user's profile.
   */
  reportSettingsError(connector: string, error: unknown): void;
}

/**
 * The boundary a run's turn hands its connector calls over at. A refusal
 * keeps only the reason, which may go to the model; the store's error goes
 * to the host.
 */
export function effectBoundary(calls: RunConnectorCalls): EffectBoundary {
  return {
    checkSending: async (connector) => {
      const check = await calls.sending.checkSending({ location: calls.location, connector });
      if (check.allowed) return check;
      if (check.error !== undefined) calls.reportSettingsError(connector, check.error);
      return { allowed: false, reason: check.reason };
    },
  };
}

/**
 * The connector with only the tools whose listing says they read: what a
 * `parallel` branch's model call is offered. A tool whose listing gives no
 * risk counts as `write`, so it is left out too. So is a tool the `approve`
 * list of the connector's file in `lists` names, under the name its server
 * lists it under, or every tool when that list is `all` (HAL-4630): it
 * waits for a person, which would only end the branch. Calls go to the
 * connector itself.
 */
export function readToolsOf(
  connector: ConnectorClient,
  lists: Readonly<Record<string, Pick<Connector["tools"], "approve">>>,
): ConnectorClient {
  const tools = Object.hasOwn(lists, connector.id) ? lists[connector.id] : undefined;
  return {
    id: connector.id,
    listTools: async () =>
      (await connector.listTools()).filter(
        (tool) => tool.risk === "read" && (tools === undefined || !needsApproval(tools, tool.name)),
      ),
    callTool: (name, args, options) => connector.callTool(name, args, options),
    close: () => connector.close(),
  };
}

/**
 * Makes the call a `call-tool` effect asks for, on the connector of that
 * id, under the name its server listed the tool under, with the effect's
 * idempotency key, which is the same on every attempt. A tool labelled
 * `send` passes the "allow sending" check again first, because a person
 * may retry a call after sending was switched off. When the connector or
 * tool can't be found, sending is off or the arguments aren't an object,
 * the call isn't made, so its outcome is `error`. When the call itself
 * fails, the connector may have done the work before it failed, so its
 * outcome is `unknown`, and the run waits for a person.
 */
export async function makeConnectorCall(
  connectors: readonly ConnectorClient[],
  boundary: EffectBoundary,
  effect: CallToolEffect,
): Promise<ToolResult> {
  const connector = connectors.find((connected) => connected.id === effect.connector);
  if (connector === undefined) {
    return notMade(`the connector "${effect.connector}" isn't connected`);
  }
  const tools = await collectTurnTools({
    callerTools: [],
    halonicTools: [],
    connectors: [connector],
  });
  // The effect names the tool as the model saw it. Once HAL-998 renames
  // tools whose names clash, that name and the listed one can differ, so
  // the call goes out under `listedName`.
  const tool = tools.byName.get(effect.tool);
  if (tool?.kind !== "server") {
    return notMade(`the connector "${effect.connector}" no longer offers ${effect.tool}`);
  }
  if (tool.risk === "send") {
    const sending = await boundary.checkSending(effect.connector);
    if (!sending.allowed) return notMade(sending.reason);
  }
  if (!isPlainObject(effect.args)) {
    return notMade(`the arguments of ${effect.tool} aren't an object`);
  }
  const risk = tool.risk === undefined ? {} : { risk: tool.risk };
  try {
    const result = await connector.callTool(tool.listedName, effect.args, {
      idempotencyKey: effect.idempotencyKey,
    });
    return { type: "tool", result, outcome: "ok", ...risk };
  } catch (error) {
    return { type: "tool", result: brokeOff(errorMessage(error)), outcome: "unknown", ...risk };
  }
}

function notMade(why: string): ToolResult {
  return { type: "tool", result: `The call wasn't made: ${why}.`, outcome: "error" };
}

/**
 * The connected servers an agent's file lists under `connectors`, in the
 * executor's order: the only ones its model calls are offered. An agent
 * with no file gets none.
 */
export function connectorsOf(
  connectors: readonly ConnectorClient[],
  agent: Agent | undefined,
): readonly ConnectorClient[] {
  if (agent === undefined) return [];
  const listed = new Set(agent.connectors);
  return connectors.filter((connector) => listed.has(connector.id));
}

/**
 * The connectors an agent's model call in a run is offered: the ones its
 * file lists ({@link connectorsOf}), with the tools their files allow
 * ({@link allowedToolsOf}). With `readOnly`, each keeps only the tools that
 * read and wait for no one ({@link readToolsOf}): what a `parallel` branch,
 * and a subagent under one, get, because neither can stop the run (HAL-4630).
 */
export function runConnectorsOf(
  connectors: readonly ConnectorClient[],
  agent: Agent | undefined,
  lists: Readonly<Record<string, Connector["tools"]>>,
  readOnly: boolean,
): readonly ConnectorClient[] {
  const allowed = allowedToolsOf(connectorsOf(connectors, agent), lists);
  return readOnly ? allowed.map((connector) => readToolsOf(connector, lists)) : allowed;
}

/**
 * The connectors as a run offers them: each with only the tools its file's
 * `allow` names, under the name its server lists them under, as the
 * outside-run gate reads the list. A connector with no `tools` lists in the
 * run's definitions is left out: a run offers nothing its files don't say.
 */
export function allowedToolsOf(
  connectors: readonly ConnectorClient[],
  lists: Readonly<Record<string, Connector["tools"]>>,
): readonly ConnectorClient[] {
  return connectors.flatMap((connector) => {
    const allow = Object.hasOwn(lists, connector.id) ? lists[connector.id]?.allow : null;
    if (allow === null) return [];
    if (allow === undefined) return [connector];
    const allowed = new Set(allow);
    return [
      {
        id: connector.id,
        listTools: async () =>
          (await connector.listTools()).filter((tool) => allowed.has(tool.name)),
        callTool: (name, args, options) => connector.callTool(name, args, options),
        close: () => connector.close(),
      },
    ];
  });
}
