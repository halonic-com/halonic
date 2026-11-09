import type { ToolOutcome, Usage } from "@halonicjs/events";
import type { ToolDefinition } from "./chat.ts";
import type { HarnessBridge, HarnessEvent } from "./harness.ts";
import { type ModelPrice, priceOf } from "./model-price.ts";

/** Version of the {@link HarnessBridgeServer} port. A breaking change bumps it and comes with an ADR. */
export const harnessBridgeServerVersion = 1;

/** A model provider the bridge passes requests to, each at one fixed host the adapter knows. */
export type BridgeProvider = "anthropic" | "openai";

/** How the agent reaches one provider through the bridge. */
export type BridgeProviderAccess =
  /**
   * With a key Halonic keeps: the bridge puts the value of the secret with
   * this name, from the `Secrets` port, in place of the program's key, and
   * records the cost from the model's price. A model without a price is
   * recorded without a cost, so the run shows it as unpriced.
   */
  | { kind: "key"; secret: string }
  /**
   * With the person's own subscription: the bridge passes the program's own
   * sign-in to the provider unchanged and never reads, logs or stores it.
   * The subscription pays and Halonic spends nothing, so the bridge records
   * the call with its tokens, `cost: 0` and `paidBy: "subscription"`. The
   * run counts it in `subscriptionCalls`, never as unpriced (which would hide
   * a keyed model that really lacks a price) and never towards a budget.
   */
  | { kind: "sign-in" };

/** What the bridge records itself: the model calls and Halonic tool calls that go through it. */
export type BridgeEvent = Extract<
  HarnessEvent,
  { type: "llm.request" | "llm.response" | "tool.called" | "tool.result" }
>;

/** Writes the bridge's events to the run's log. The engine adds `runId`, `seq`, `at` and the `state`. */
export interface BridgeRecorder {
  record(event: BridgeEvent): Promise<void>;
}

/**
 * What to do with a tool call before it runs, by the same rules as the
 * built-in loop: the agent's `allow` and `approve` lists, the connection's
 * "allow sending" setting and the workspace's trust. `ask`: run it only once
 * a person says yes. `refused`: don't run it; `reason` goes back to the
 * program as the call's result.
 */
export type BridgeToolCheck =
  | { kind: "run" }
  | { kind: "ask" }
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
   * {@link bridgeCallCost}.
   */
  price(provider: BridgeProvider, model: string): ModelPrice | null;
  recorder: BridgeRecorder;
  tools: BridgeTools;
  approvals: BridgeApprovals;
  /** Aborting it closes the bridge, as {@link OpenHarnessBridge.close} does. */
  signal?: AbortSignal;
}

/**
 * The `cost` the bridge records on a model call's `llm.response`, in the
 * workspace's budget currency (requirement `ports.harness-bridge-server`).
 * A sign-in call costs 0, because the person's subscription pays. A keyed call
 * costs its tokens at the model's price ({@link priceOf}), or is `undefined` (unpriced) when the
 * model has no price.
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
   * calls to the provider, and resolves when they have ended. Safe to call
   * twice.
   */
  close(): Promise<void>;
}

/**
 * Opens the Halonic bridge for one run: a server on loopback that passes the
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
   * Starts serving one run on a free loopback port.
   *
   * @throws when it can't listen on loopback
   */
  open(options: HarnessBridgeOptions): Promise<OpenHarnessBridge>;
}
