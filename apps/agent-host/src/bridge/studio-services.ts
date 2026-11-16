import type {
  BridgeApprovalDecision,
  BridgeApprovalRequest,
  BridgeApprovals,
  BridgeProvider,
  BridgeProviderAccess,
  BridgeRecorder,
  BridgeTools,
  Secrets,
} from "@halonicjs/ports";
import { parse, type Schema, s } from "@halonicjs/schema-kit";
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
const toolCheck = s.discriminatedUnion("kind", [
  s.object({ kind: s.literal("run") }),
  s.object({ kind: s.literal("ask") }),
  s.object({ kind: s.literal("refused"), reason: s.string() }),
]);
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
 * The provider keys of one bridge, which Studio keeps. Only the secrets the
 * bridge's providers name are asked for: any other name is `null` without a
 * call, so the bridge can't read the person's other secrets through it.
 */
export function studioSecrets(
  channel: CallChannel,
  providers: Partial<Record<BridgeProvider, BridgeProviderAccess>>,
): Secrets {
  const named = new Set<string>();
  for (const access of Object.values(providers)) {
    if (access?.kind === "key") named.add(access.secret);
  }
  return {
    get: async (name) =>
      named.has(name)
        ? checked(secretValue, await channel.call(studioMethods.getSecret, { name }, quick))
        : null,
  };
}

/** Studio's answer when it has the shape the port promises. */
function checked<T>(schema: Schema<T>, value: unknown): T {
  const parsed = parse(schema, value);
  if (!parsed.ok)
    throw new StudioCallError("Studio answered a call with a value of the wrong shape.");
  return parsed.value as T;
}
