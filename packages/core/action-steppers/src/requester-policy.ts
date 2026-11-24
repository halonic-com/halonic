import type { StepperRisk } from "./stepper-risk.ts";

/**
 * Where a request came from, as the `AgentMessaging` provider attests it:
 * a Halonic workspace's runs, a Paperclip instance, or the user themself.
 * Never read from the request's own `requester` field.
 */
export interface AttestedSource {
  kind: "halonic" | "paperclip" | "user";
  /** The workspace or instance, such as `acme` or `paperclip.acme.example`; empty for the user. */
  id: string;
}

/**
 * A source the user allowed to send `admin` and `irreversible` requests. With
 * `agents`, only requests that claim one of those agents pass: an agent's name
 * is a claim within its source, so it can only narrow the rule.
 */
export interface AllowedRequester {
  source: AttestedSource;
  agents?: readonly string[];
}

/** The deciding policy, kept in the user's profile and changed only on Studio's Settings screen. */
export interface RequesterPolicy {
  allowed: readonly AllowedRequester[];
}

/** The default: anyone may ask for `routine` steppers, nobody else for more. */
export const defaultRequesterPolicy: RequesterPolicy = { allowed: [] };

function sameSource(left: AttestedSource, right: AttestedSource): boolean {
  return left.kind === right.kind && left.id === right.id;
}

function ruleAllows(
  rule: AllowedRequester,
  source: AttestedSource,
  claimedAgent: string | undefined,
): boolean {
  if (!sameSource(rule.source, source)) return false;
  if (rule.agents === undefined) return true;
  return claimedAgent !== undefined && rule.agents.includes(claimedAgent);
}

/**
 * Decides whether the user's policy lets a request of this risk run
 * (architecture note on HAL-17491, 6.5). `routine` requests and the user's
 * own always pass; `admin` and `irreversible` ones only from an allowed source.
 *
 * @param claimedAgent - the agent the request says filed it; a claim only
 * @returns `allowed`, or `blocked` for "Blocked by your settings"
 */
export function decideRequester(
  policy: RequesterPolicy,
  source: AttestedSource,
  claimedAgent: string | undefined,
  risk: StepperRisk,
): "allowed" | "blocked" {
  if (risk === "routine" || source.kind === "user") return "allowed";
  const allowed = policy.allowed.some((rule) => ruleAllows(rule, source, claimedAgent));
  return allowed ? "allowed" : "blocked";
}
