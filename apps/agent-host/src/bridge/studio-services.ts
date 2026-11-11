import type {
  BridgeApprovalDecision,
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
  getSecret: "secrets.get",
} as const;

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

/** The bridge's recorder, tools and approvals, each a call to Studio, where the engine keeps them. */
export function studioServices(channel: CallChannel): {
  recorder: BridgeRecorder;
  tools: BridgeTools;
  approvals: BridgeApprovals;
} {
  return {
    recorder: {
      record: async (event) => {
        await channel.call(studioMethods.record, event);
      },
    },
    tools: {
      list: async () => checked(toolList, await channel.call(studioMethods.listTools, {})),
      check: async (name, args) =>
        checked(toolCheck, await channel.call(studioMethods.checkTool, { name, args })),
      call: async (name, args, { signal }) =>
        checked(toolResult, await channel.call(studioMethods.callTool, { name, args }, { signal })),
    },
    approvals: {
      request: async (request, { signal }) =>
        checked(
          approvalDecision,
          await channel.call(studioMethods.requestApproval, request, { signal }),
        ),
    },
  };
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
        ? checked(secretValue, await channel.call(studioMethods.getSecret, { name }))
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
