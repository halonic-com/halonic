import type { RunEventBody, ToolOutcome, Usage } from "@halonicjs/events";
import type { ToolDefinition } from "./chat.ts";
import type { HarnessBridge, HarnessEvent } from "./harness.ts";
import { type ModelPrice, priceOf } from "./model-price.ts";

/** Version of the {@link HarnessBridgeServer} port. A breaking change bumps it and comes with an ADR. */
export const harnessBridgeServerVersion = 1;

/**
 * The API a model provider speaks, which the bridge passes requests on in:
 * Anthropic's Messages API, or OpenAI's Responses API. Each is at a fixed
 * host the adapter knows, unless a keyed access names its own `baseUrl`.
 */
export type BridgeProvider = "anthropic" | "openai";

/** How the agent reaches one provider through the bridge. */
export type BridgeProviderAccess =
  /**
   * With a key Halonic keeps: the bridge puts the value of the secret with
   * this name, from the `Secrets` port, in place of the program's key, and
   * records the cost from the model's price. A model without a price is
   * recorded without a cost, so the run shows it as unpriced.
   *
   * `baseUrl` is the provider file's address for a host that speaks the
   * same API, such as `https://api.z.ai/api/anthropic`. The bridge sends
   * this agent's calls, and the key, to that one origin only; without it,
   * to the API's own host. The host has already checked that the key may
   * go there (the workspace's trust and the key's allowed addresses).
   *
   * `providerId` is the id of the provider file the key comes from, such
   * as `zai`. The bridge names it as the call's `provider` in `llm.request`
   * and `llm.response`, so the run log shows where the call went; without
   * it, the API's own name (`anthropic`, `openai`).
   *
   * `models` are the models the host resolved for this agent at this
   * provider: its alias's model, and the models of its fallbacks that use
   * the same provider file. With a `baseUrl`, the bridge refuses a call that
   * names any other model, exactly as written, and every call when the list
   * is missing or empty, since a compatible provider can serve models that
   * reach the network from its own side. Without a `baseUrl`, the bridge
   * ignores it: it is no allow-list for the APIs' own hosts.
   */
  | {
      kind: "key";
      secret: string;
      baseUrl?: string;
      providerId?: string;
      models?: readonly string[];
    }
  /**
   * With the person's own subscription: the bridge passes the program's own
   * sign-in to the provider unchanged and never reads, logs or stores it.
   * The subscription pays and Halonic spends nothing, so the bridge records
   * the call with its tokens, `cost: 0` and `paidBy: "subscription"`. The
   * run counts it in `subscriptionCalls`, never as unpriced (which would hide
   * a keyed model that really lacks a price) and never towards a budget.
   */
  | { kind: "sign-in" };

/**
 * What is recorded of the bridge: the model calls and Halonic tool calls that
 * go through it, and the failures it told the program the run log has the
 * details of (`bridge.failed`, from {@link HarnessBridgeOptions.reportError}).
 */
export type BridgeEvent =
  | Extract<HarnessEvent, { type: "llm.request" | "llm.response" | "tool.called" | "tool.result" }>
  | Extract<RunEventBody, { type: "bridge.failed" }>;

/** Writes the bridge's events to the run's log. The engine adds `runId`, `seq`, `at` and the `state`. */
export interface BridgeRecorder {
  /**
   * A `bridge.failed` never counts towards the budget, so recording one never
   * throws `limit_reached`.
   *
   * @throws KindedError `limit_reached` for an `llm.request` once the run's
   *   budget is reached: the bridge then sends the model call nowhere and
   *   answers the program with 429 and the error's message
   */
  record(event: BridgeEvent): Promise<void>;
}

/**
 * What to do with a tool call before it runs, by the same rules as the
 * built-in loop: the agent's `allow` and `approve` lists, the connection's
 * "allow sending" setting and the workspace's trust. `ask`: run it only once
 * a person says yes; `connector` names the connector the tool comes from,
 * when it comes from one, for the approval's record. `refused`: don't run it; `reason` goes back to the
 * program as the call's result.
 */
export type BridgeToolCheck =
  | { kind: "run" }
  | { kind: "ask"; connector?: string }
  | { kind: "refused"; reason: string };

/** How a tool call ended: its text result, and whether the tool answered or failed. */
export interface BridgeToolResult {
  result: string;
  outcome: ToolOutcome;
}

/**
 * Halonic's tools for one agent of one run, which the bridge serves over MCP.
 * The engine builds them, so integrations and their secrets stay in Halonic.
 */
export interface BridgeTools {
  /** The tools the agent is offered, in order. */
  list(): Promise<ToolDefinition[]>;
  /** Checks one call before it runs. A name {@link list} didn't offer is `refused`. */
  check(name: string, args: Record<string, unknown>): Promise<BridgeToolCheck>;
  /**
   * Runs one call that {@link check} allowed, or a person approved. A tool
   * that fails doesn't throw: it ends with `outcome: "error"` and the reason
   * as its result.
   */
  call(
    name: string,
    args: Record<string, unknown>,
    options: { signal: AbortSignal },
  ): Promise<BridgeToolResult>;
}

/** One call a person has to approve. `tool` is a Halonic tool, or one of the program's own, such as "Bash". */
export interface BridgeApprovalRequest {
  /** Unique in the run; the bridge makes it up. */
  callId: string;
  tool: string;
  /** The connector the tool comes from, when it comes from one; `tool` stays the bare name. */
  connector?: string;
  args: unknown;
}

/** A person's answer to a {@link BridgeApprovalRequest}. */
export interface BridgeApprovalDecision {
  approved: boolean;
  comment?: string;
}

/**
 * Asks a person for an OK. The engine writes `approval.requested`, waits for
 * the answer and writes `approval.resolved`, as it does for the built-in
 * loop.
 */
export interface BridgeApprovals {
  /**
   * Resolves with the person's decision.
   *
   * @throws when `signal` aborts first, because the run was cancelled or the program went away
   */
  request(
    request: BridgeApprovalRequest,
    options: { signal: AbortSignal },
  ): Promise<BridgeApprovalDecision>;
}

/** What the engine gives the bridge of one run. */
export interface HarnessBridgeOptions {
  runId: string;
  /** The agent the bridge's events name. */
  agentId: string;
  /** The providers this agent may reach and how it signs in. A provider not named here is refused. */
  providers: Partial<Record<BridgeProvider, BridgeProviderAccess>>;
  /**
   * A model's price, or `null` when `models.yaml` gives none. Only asked for
   * a provider reached with a key: a keyed call without a price is recorded
   * without a cost (unpriced), and a sign-in call always costs 0. See
   * {@link bridgeCallCharge}.
   */
  price(provider: BridgeProvider, model: string): ModelPrice | null;
  recorder: BridgeRecorder;
  tools: BridgeTools;
  approvals: BridgeApprovals;
  /**
   * Hears of a request that failed for a reason the bridge doesn't name to the
   * program, so the run log can hold what the program was told is there.
   * `kind` is the error kind of `@halonicjs/std`; `message` never holds the run token. It must not throw.
   */
  reportError?(failure: { kind: string; message: string }): void;
  /** Aborting it closes the bridge, as {@link OpenHarnessBridge.close} does. */
  signal?: AbortSignal;
}

/**
 * The `cost` the bridge records on a model call's `llm.response`, in the
 * workspace's budget currency (requirement `ports.harness-bridge-server`).
 * A sign-in call costs 0, because the person's subscription pays. A keyed call
 * costs its tokens at the model's price ({@link priceOf}), or is `undefined` (unpriced) when the
 * model has no price.
 *
 * @deprecated Use {@link bridgeCallCharge}, which also marks a sign-in call
 * `paidBy: "subscription"`. Recording this cost alone writes a sign-in call
 * as a free call, so the run never counts it in `subscriptionCalls`.
 */
export function bridgeCallCost(
  access: BridgeProviderAccess,
  price: ModelPrice | null,
  usage: Usage,
): number | undefined {
  if (access.kind === "sign-in") return 0;
  if (price === null) return undefined;
  return priceOf(price, usage);
}

/** What the bridge puts on a model call's `llm.response` about its price: see {@link bridgeCallCharge}. */
export type BridgeCallCharge = Pick<
  Extract<BridgeEvent, { type: "llm.response" }>,
  "cost" | "paidBy"
>;

/**
 * The `cost` and `paidBy` the bridge records on a model call's
 * `llm.response` (requirement `ports.harness-bridge-server`). A sign-in call
 * gets `cost: 0` and `paidBy: "subscription"`, so the run counts it in
 * `subscriptionCalls`. A keyed call gets the cost from {@link bridgeCallCost},
 * or nothing when its model has no price.
 *
 * @example
 * recorder.record({ type: "llm.response", ...call, ...bridgeCallCharge(access, price, usage) });
 */
export function bridgeCallCharge(
  access: BridgeProviderAccess,
  price: ModelPrice | null,
  usage: Usage,
): BridgeCallCharge {
  if (access.kind === "sign-in") return { cost: 0, paidBy: "subscription" };
  const cost = bridgeCallCost(access, price, usage);
  return cost === undefined ? {} : { cost };
}

/** A bridge that is serving one run. */
export interface OpenHarnessBridge extends HarnessBridge {
  /**
   * Stops serving: refuses new requests, ends those in flight and their
   * calls to the provider, and resolves when they have ended and recorded
   * what they had to, or after the bridge's close time limit for a request
   * that doesn't end. Nothing is recorded for the run once it resolves.
   * Safe to call twice.
   */
  close(): Promise<void>;
}

/**
 * Opens the Halonic bridge for one run: a server on loopback, or on a Unix
 * socket only this user can open, that passes the
 * program's model requests to the provider and serves Halonic's tools and
 * approvals over MCP (requirement `ports.harness-bridge-server`). The engine
 * opens it before the sandbox and closes it when the run ends. It is a port
 * because core can't import the adapter that serves it.
 *
 * Only a request with the run's token in the `harnessBridgeTokenHeader`
 * header is served. The token, a provider key and a person's sign-in never
 * appear in an event, a log line or an error.
 *
 * @example
 * const bridge = await server.open({ runId, agentId, providers, price, recorder, tools, approvals, signal });
 * try {
 *   await runHarness(bridge);
 * } finally {
 *   await bridge.close();
 * }
 */
export interface HarnessBridgeServer {
  /**
   * Starts serving one run on a free loopback port, or on a new Unix socket
   * of its own when the adapter is set up for sockets. A socket bridge gives
   * its path as {@link HarnessBridge.socketPath}. One that can't create its
   * socket fails: it never falls back to a loopback port.
   *
   * @throws when it can't listen
   */
  open(options: HarnessBridgeOptions): Promise<OpenHarnessBridge>;
}
