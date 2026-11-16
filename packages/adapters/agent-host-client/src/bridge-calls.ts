import type {
  BridgeApprovalRequest,
  BridgeApprovals,
  BridgeEvent,
  BridgeRecorder,
  BridgeTools,
  Secrets,
} from "@halonicjs/ports";
import { parse, type Schema, s } from "@halonicjs/schema-kit";

/**
 * What Studio says to a decision made on a remote device. The host declares
 * the same type in agent-host's bridge/studio-services.ts; keep the two equal.
 */
export type RemoteDecisionStatus = "decided" | "unknown" | "already-decided";

/** A decision on a waiting approval that the host passes on from a remote device. */
export interface RemoteDecision {
  readonly callId: string;
  readonly approved: boolean;
  /** Always `remote-device`, set by the host from its own authenticated gateway. */
  readonly source: "remote-device";
}

/**
 * Takes a decision from a remote device into the engine's own approval path,
 * for an approval that waits right now under that call id and no other. The
 * first decision wins: a later one is `already-decided`.
 */
export interface RemoteDecisions {
  decide(decision: RemoteDecision): Promise<RemoteDecisionStatus>;
}

/** What Studio serves one bridge besides its recorder: the engine's tools, approvals and keys. */
export interface BridgeCallServices {
  readonly tools: BridgeTools;
  readonly approvals: BridgeApprovals;
  /** Absent while the engine has no approval path for a remote device: its decisions are refused. */
  readonly remoteDecisions?: RemoteDecisions;
  /** The provider keys; the host asks only for those the bridge's providers name. */
  readonly secrets: Pick<Secrets, "get">;
}

const toolArgs = s.record(s.string(), s.unknown());
const toolParams = s.object({ name: s.string().min(1), args: toolArgs }).strict();
const approvalParams = s
  .object({ callId: s.string().min(1), tool: s.string().min(1), args: s.unknown() })
  .strict();
const remoteDecisionParams = s
  .object({
    callId: s.string().min(1),
    approved: s.boolean(),
    source: s.literal("remote-device"),
  })
  .strict();
const secretParams = s.object({ name: s.string().min(1) }).strict();
const eventParams = s.object({ type: s.string() }).passthrough();

/**
 * Answers one call the bridge in the host makes on Studio, by its method
 * (`recorder.record`, `tools.list`, `tools.check`, `tools.call`,
 * `approvals.request`, `approvals.remote-decision`, `secrets.get`), with the port's arguments.
 *
 * @param signal - aborts when the host cancels the call (the program went away)
 * @returns the port's answer, `null` for one that has none
 * @throws when the method is unknown or its arguments aren't the port's,
 *   or the service itself fails
 */
export async function answerBridgeCall(
  method: string,
  params: unknown,
  services: BridgeCallServices & { readonly recorder: BridgeRecorder },
  signal: AbortSignal,
): Promise<unknown> {
  switch (method) {
    case "recorder.record":
      await services.recorder.record(paramsOf(method, params, eventParams) as BridgeEvent);
      return null;
    case "tools.list":
      return services.tools.list();
    case "tools.check": {
      const { name, args } = paramsOf(method, params, toolParams);
      return services.tools.check(name, args);
    }
    case "tools.call": {
      const { name, args } = paramsOf(method, params, toolParams);
      return services.tools.call(name, args, { signal });
    }
    case "approvals.request": {
      const request = paramsOf(method, params, approvalParams) as BridgeApprovalRequest;
      return services.approvals.request(request, { signal });
    }
    case "approvals.remote-decision": {
      const decision = paramsOf(method, params, remoteDecisionParams);
      if (services.remoteDecisions === undefined) {
        throw new Error("Studio can't take a decision from a remote device yet.");
      }
      return { status: await services.remoteDecisions.decide(decision) };
    }
    case "secrets.get":
      return services.secrets.get(paramsOf(method, params, secretParams).name);
    default:
      throw new Error(`Studio doesn't answer the bridge's ${JSON.stringify(method)} calls.`);
  }
}

function paramsOf<T>(method: string, params: unknown, schema: Schema<T>): T {
  const parsed = parse(schema, params);
  if (!parsed.ok) throw new Error(`The bridge called ${method} with arguments of the wrong shape.`);
  return parsed.value as T;
}
