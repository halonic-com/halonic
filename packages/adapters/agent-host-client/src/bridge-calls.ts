import type {
  BridgeApprovalRequest,
  BridgeApprovals,
  BridgeEvent,
  BridgeRecorder,
  BridgeTools,
  Secrets,
} from "@halonicjs/ports";
import { parse, type Schema, s } from "@halonicjs/schema-kit";

/** What Studio serves one bridge besides its recorder: the engine's tools, approvals and keys. */
export interface BridgeCallServices {
  readonly tools: BridgeTools;
  readonly approvals: BridgeApprovals;
  /** The provider keys; the host asks only for those the bridge's providers name. */
  readonly secrets: Pick<Secrets, "get">;
}

const toolArgs = s.record(s.string(), s.unknown());
const toolParams = s.object({ name: s.string().min(1), args: toolArgs }).strict();
const approvalParams = s
  .object({ callId: s.string().min(1), tool: s.string().min(1), args: s.unknown() })
  .strict();
const secretParams = s.object({ name: s.string().min(1) }).strict();
const eventParams = s.object({ type: s.string() }).passthrough();

/**
 * Answers one call the bridge in the host makes on Studio, by its method
 * (`recorder.record`, `tools.list`, `tools.check`, `tools.call`,
 * `approvals.request`, `secrets.get`), with the port's arguments.
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
