import type {
  BridgeApprovalDecision,
  BridgeApprovalRequest,
  BridgeApprovals,
  BridgeProvider,
  BridgeProviderAccess,
  BridgeRecorder,
  BridgeToolCheck,
  BridgeTools,
  Secrets,
} from "@halonicjs/ports";
import { parse, type Schema, s } from "@halonicjs/schema-kit";
import type { SecretScrubber } from "@halonicjs/std";
import { type CallChannel, StudioCallError } from "../server/call-channel.ts";
import { portSchema } from "../server/port-schema.ts";

/** The methods the bridge calls on Studio, as each call line's `method`. */
export const studioMethods = {
  record: "recorder.record",
  listTools: "tools.list",
  checkTool: "tools.check",
  callTool: "tools.call",
  requestApproval: "approvals.request",
  remoteDecision: "approvals.remote-decision",
  getSecret: "secrets.get",
} as const;

/**
 * How long Studio may take to answer a call it can answer at once: recording
 * an event, listing or checking tools, and reading a secret. A Studio that
 * hangs then fails the bridge's request instead of holding it forever. A
 * tool's run and a person's approval rightly take longer and have no limit.
 */
export const quickCallLimitMs = 30_000;
const quick = { timeLimitMs: quickCallLimitMs };

const toolList = s.array(
  s.object({
    name: s.string(),
    description: s.string(),
    parameters: s.record(s.string(), s.unknown()),
  }),
);
const toolCheck = portSchema<BridgeToolCheck>(
  s.discriminatedUnion("kind", [
    s.object({ kind: s.literal("run") }),
    s.object({ kind: s.literal("ask"), connector: s.string().optional() }),
    s.object({ kind: s.literal("refused"), reason: s.string() }),
  ]),
);
const toolResult = s.object({ result: s.string(), outcome: s.enum(["ok", "error", "unknown"]) });
const approvalDecision = portSchema<BridgeApprovalDecision>(
  s.object({ approved: s.boolean(), comment: s.string().optional() }),
);
const secretValue = s.string().nullable();
const remoteDecisionAnswer = s.object({
  status: s.enum(["decided", "unknown", "already-decided"]),
});

/**
 * What Studio says to a decision from a remote device: it was taken, no such
 * approval waits (it is unknown, or ended), or someone decided first.
 * The client package declares the same type for the wire contract
 * (`RemoteDecisionStatus` in agent-host-client's bridge-calls.ts); keep the two equal.
 */
export type RemoteDecisionStatus = "decided" | "unknown" | "already-decided";

/**
 * Tells Studio a person decided a waiting approval on a remote device.
 * Studio's engine decides it from there, and the answer comes back through
 * the approval's own call, which is what settles it for the ledger.
 */
export type DecideRemotely = (approved: boolean) => Promise<RemoteDecisionStatus>;

/**
 * Who is told when the bridge asks Studio for an approval and when that call
 * ends, such as the remote gateway's ledger. It only listens: a fault in it is
 * dropped, never failing the approval.
 */
export interface ApprovalObserver {
  asked(request: BridgeApprovalRequest, decide: DecideRemotely): void;
  /** `decision` is `undefined` when the call ended without one: cancelled, or Studio failed. */
  ended(callId: string, decision: BridgeApprovalDecision | undefined): void;
}

/**
 * The bridge's recorder, tools and approvals, each a call to Studio, where the engine keeps them.
 *
 * @param observer - told of each approval the bridge asks for
 */
export function studioServices(
  channel: CallChannel,
  observer?: ApprovalObserver,
): {
  recorder: BridgeRecorder;
  tools: BridgeTools;
  approvals: BridgeApprovals;
} {
  return {
    recorder: {
      record: async (event) => {
        await channel.call(studioMethods.record, event, quick);
      },
    },
    tools: {
      list: async () => checked(toolList, await channel.call(studioMethods.listTools, {}, quick)),
      check: async (name, args) =>
        checked(toolCheck, await channel.call(studioMethods.checkTool, { name, args }, quick)),
      call: async (name, args, { signal }) =>
        checked(toolResult, await channel.call(studioMethods.callTool, { name, args }, { signal })),
    },
    approvals: {
      request: async (request, { signal }) => {
        listen(() =>
          observer?.asked(request, (approved) => decideRemotely(channel, request.callId, approved)),
        );
        let decision: BridgeApprovalDecision | undefined;
        try {
          decision = checked(
            approvalDecision,
            await channel.call(studioMethods.requestApproval, request, { signal }),
          );
          return decision;
        } finally {
          listen(() => observer?.ended(request.callId, decision));
        }
      },
    },
  };
}

/**
 * The call for a decision from a remote device. `source` is set here, by the
 * host, so nothing a phone sends can change who Studio's run log says decided.
 * Studio not answering in time is an error: the approval stays waiting, and
 * is never taken as allowed.
 */
async function decideRemotely(
  channel: CallChannel,
  callId: string,
  approved: boolean,
): Promise<RemoteDecisionStatus> {
  const params = { callId, approved, source: "remote-device" };
  const answer = await channel.call(studioMethods.remoteDecision, params, quick);
  return checked(remoteDecisionAnswer, answer).status;
}

/** Runs what an observer does, so that a fault in it never breaks the call it listens to. */
function listen(tell: () => void): void {
  try {
    tell();
  } catch {
    // The observer only records; the approval goes on without it.
  }
}

/**
 * The bridge's `reportError`: sends each failure the bridge told the program
 * the run log has the details of to Studio's recorder as a `bridge.failed`,
 * through the recorder's own call, so a Studio from before this event needs
 * nothing new. The bridge's hook must not throw and can't wait, so a record
 * Studio doesn't take goes to `log` rather than back to the bridge.
 *
 * A failure's message loses every key value the bridge's secrets handed out
 * first, so a key a provider's error quotes reaches neither the run log nor
 * `log` (Studio scrubs it again before the run log records it).
 */
export function studioFailureReport(
  channel: CallChannel,
  agentId: string,
  log: (text: string) => void,
  keys: Pick<SecretScrubber, "scrub">,
): (failure: { kind: string; message: string }) => void {
  return (failure) => {
    const message = keys.scrub(failure.message);
    const event = {
      type: "bridge.failed",
      agent: agentId,
      kind: failure.kind,
      message,
    };
    channel.call(studioMethods.record, event, quick).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      log(
        `The run log couldn't record a failure of the harness bridge (${failure.kind}): ${message} (${reason})\n`,
      );
    });
  };
}

/**
 * The provider keys of one bridge, which Studio keeps. Only the secrets the
 * bridge's providers name are asked for: any other name is `null` without a
 * call, so the bridge can't read the person's other secrets through it.
 * Each value Studio gives is remembered in `keys`, so the bridge's failures
 * are scrubbed of it ({@link studioFailureReport}).
 */
export function studioSecrets(
  channel: CallChannel,
  providers: Partial<Record<BridgeProvider, BridgeProviderAccess>>,
  keys: Pick<SecretScrubber, "remember">,
): Secrets {
  const named = new Set<string>();
  for (const access of Object.values(providers)) {
    if (access?.kind === "key") named.add(access.secret);
  }
  return {
    get: async (name) => {
      if (!named.has(name)) return null;
      const value = checked(
        secretValue,
        await channel.call(studioMethods.getSecret, { name }, quick),
      );
      if (value !== null) keys.remember(value);
      return value;
    },
  };
}

/** Studio's answer when it has the shape the port promises. */
function checked<T>(schema: Schema<T>, value: unknown): T {
  const parsed = parse(schema, value);
  if (!parsed.ok)
    throw new StudioCallError("Studio answered a call with a value of the wrong shape.");
  return parsed.value as T;
}
