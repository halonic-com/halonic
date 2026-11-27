import {
  type InboxReach,
  type InboxReachEnv,
  inboxReachEnvMax,
  inboxReachNameMax,
  reachNameFits,
} from "@halonicjs/ports";
import { asRecord, field, type JsonRecord, text } from "./json.ts";

// What approving a risky item reaches, by name (`paperclip-client.risky-reach`), for the desktop
// shell's own confirmation. Each function reads only the fields it names. Of an environment
// binding it reads only `type`, never `value` or `secretId`, so no value can reach an item.

/**
 * `value` as a name a confirmation shows on one line: format characters and lone surrogates are
 * dropped, control characters and runs of white space become one space, and a name longer than
 * the port takes is cut between code points, ending in "…", so no surrogate pair is split.
 */
function shown(value: string | undefined): string | undefined {
  const line = value
    ?.replace(/[\p{Cf}\p{Cs}]/gu, "")
    .replace(/[\s\p{Cc}]+/gu, " ")
    .trim();
  if (line === undefined || line === "") {
    return undefined;
  }
  if (line.length <= inboxReachNameMax) {
    return line;
  }
  let cut = "";
  for (const codePoint of line) {
    if (cut.length + codePoint.length > inboxReachNameMax - 1) break;
    cut += codePoint;
  }
  return `${cut}…`;
}

/**
 * The variables of an `env` setting by name, with which bind a secret, and how many it left out:
 * those past the port's limit and those whose name can't be shown as it is.
 */
function envReach(env: unknown): Pick<InboxReach, "env" | "envLeftOut"> {
  const bindings = asRecord(env);
  if (bindings === undefined) {
    return {};
  }
  const names = Object.keys(bindings);
  const named: InboxReachEnv[] = names
    .filter((name) => reachNameFits(name))
    .slice(0, inboxReachEnvMax)
    .map((name) => {
      // A plain binding is `type: "plain"` or a legacy bare string: only `type` is read. Any other
      // shape, such as a binding type Paperclip adds later, counts as binding a secret.
      const binding = field(bindings, name);
      const plain = typeof binding === "string" || text(asRecord(binding), "type") === "plain";
      return { name, bindsSecret: !plain };
    });
  const leftOut = names.length - named.length;
  return {
    ...(named.length === 0 ? {} : { env: named }),
    ...(leftOut === 0 ? {} : { envLeftOut: leftOut }),
  };
}

/** A reach whose parts may each be left undefined. */
type ReachParts = { [Part in keyof InboxReach]?: InboxReach[Part] | undefined };

/** `parts` without the ones left undefined, or `undefined` when nothing is left. */
function reachOf(parts: ReachParts): InboxReach | undefined {
  const reach = Object.fromEntries(
    Object.entries(parts).filter(([, value]) => value !== undefined),
  ) as InboxReach;
  return Object.keys(reach).length === 0 ? undefined : reach;
}

/** What approving a `hire_agent` approval reaches: the agent hired, its adapter and its variables. */
export function hireReach(payload: JsonRecord | undefined): InboxReach | undefined {
  const adapterConfig = asRecord(field(payload, "adapterConfig"));
  return reachOf({
    agent: shown(text(payload, "name")),
    adapter: shown(text(payload, "adapterType")),
    ...envReach(field(adapterConfig, "env")),
  });
}

/**
 * What approving an agent's join request reaches: the agent, its adapter and the variables of its
 * adapter defaults. A person's join request reaches no agent, so it has none.
 */
export function joinReach(record: JsonRecord): InboxReach | undefined {
  if (text(record, "requestType") !== "agent") {
    return undefined;
  }
  const defaults = asRecord(field(record, "agentDefaultsPayload"));
  return reachOf({
    agent: shown(text(record, "agentName")),
    adapter: shown(text(record, "adapterType")),
    ...envReach(field(defaults, "env")),
  });
}

/**
 * What approving a secret proposal reaches: for a binding, the agent that gets the secret and its
 * setting path; for a new secret, the agent that proposed it and the secret's name.
 */
export function proposalReach(
  record: JsonRecord,
  proposer: string | undefined,
): InboxReach | undefined {
  if (text(record, "kind") === "binding") {
    const name = shown(text(record, "secretName") ?? text(record, "secretProposalName"));
    const settingPath = shown(text(record, "configPath"));
    return reachOf({
      agent: shown(text(asRecord(field(record, "target")), "name")),
      secret:
        name === undefined
          ? undefined
          : { name, ...(settingPath === undefined ? {} : { settingPath }) },
    });
  }
  const name = shown(text(record, "proposedName") ?? text(record, "proposedKey"));
  return reachOf({ agent: shown(proposer), secret: name === undefined ? undefined : { name } });
}

/** A confirmation card's `payload.secretProposal`, which Paperclip sets when accepting the card approves a secret binding. */
function cardProposal(payload: JsonRecord | undefined): JsonRecord | undefined {
  return asRecord(field(payload, "secretProposal"));
}

/**
 * Whether accepting a card approves a secret proposal: Paperclip set `payload.secretProposal` on
 * it, and its Accept approves the binding, so it is as risky as the proposal itself.
 */
export function cardApprovesProposal(payload: JsonRecord | undefined): boolean {
  return cardProposal(payload) !== undefined;
}

/**
 * What accepting a card that carries a secret proposal reaches: the agent that gets the secret
 * (`targetAgentName`) and the secret (`sourceSecretLabel`) with its setting path (`configPath`).
 */
export function cardReach(payload: JsonRecord | undefined): InboxReach | undefined {
  const proposal = cardProposal(payload);
  if (proposal === undefined) {
    return undefined;
  }
  const name = shown(text(proposal, "sourceSecretLabel"));
  const settingPath = shown(text(proposal, "configPath"));
  return reachOf({
    agent: shown(text(proposal, "targetAgentName")),
    secret:
      name === undefined
        ? undefined
        : { name, ...(settingPath === undefined ? {} : { settingPath }) },
  });
}
