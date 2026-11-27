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

/** The binding types whose value is a secret Paperclip keeps: a company's or a person's. */
const secretBindingTypes: ReadonlySet<string> = new Set(["secret_ref", "user_secret_ref"]);

/**
 * `value` as a name a confirmation shows on one line: control characters and runs of white space
 * become one space, and a name longer than the port takes is cut, ending in "…".
 */
function shown(value: string | undefined): string | undefined {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it removes.
  const line = value?.replace(/[\s\u0000-\u001f\u007f]+/g, " ").trim();
  if (line === undefined || line === "") {
    return undefined;
  }
  return line.length <= inboxReachNameMax ? line : `${line.slice(0, inboxReachNameMax - 1)}…`;
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
      // A plain binding is an object with a value, or a legacy bare string: only `type` is read.
      const type = text(asRecord(field(bindings, name)), "type");
      return { name, bindsSecret: type !== undefined && secretBindingTypes.has(type) };
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
