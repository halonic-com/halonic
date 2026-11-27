// What approving a risky inbox item gives an agent, by name only (requirement
// `ports.agent-messaging-reach`). Studio's desktop shell builds its own confirmation
// from it, so the person sees what an approve reaches before anything is sent.
import type { InboxItem } from "./agent-messaging.ts";

/** The most environment variables one item's {@link InboxReach} names. */
export const inboxReachEnvMax = 100;

/** The longest name an {@link InboxReach} holds, in characters. */
export const inboxReachNameMax = 200;

/** One environment variable an approve would set for an agent: its name, never its value. */
export interface InboxReachEnv {
  /** The variable's name, such as `ACME_DEPLOY_TOKEN`. */
  name: string;
  /** Whether it binds a secret kept by the source rather than a plain value. */
  bindsSecret: boolean;
}

/** The secret an approve would create or give an agent: its name and setting path, never its value. */
export interface InboxReachSecret {
  /** The secret's name in the source, such as "Acme deploy token". */
  name: string;
  /** Where the agent would read it, such as `env.ACME_DEPLOY_TOKEN`. */
  settingPath?: string;
}

/**
 * What approving or accepting a `risky` item reaches, set by the provider only and only from the
 * source's own record, never from the question an agent wrote. It holds names only, never a value:
 * no secret, no environment variable's value and no setting's value.
 */
export interface InboxReach {
  /** The agent the approve acts for: the one hired, joining or getting the secret. */
  agent?: string;
  secret?: InboxReachSecret;
  /** The adapter the agent would run with, such as `process`. */
  adapter?: string;
  /** The environment variables the agent would get, by name. */
  env?: readonly InboxReachEnv[];
  /**
   * How many more variables the agent would get than `env` names: those past the limit, or with
   * a name a confirmation can't show. Apps say they exist, so an approve never hides one.
   */
  envLeftOut?: number;
}

/**
 * Whether an item's `reach` holds together: only a `risky` item has one, and each name in it is
 * 1 to {@link inboxReachNameMax} characters with no control character, so a confirmation can show
 * it on one line, with at most {@link inboxReachEnvMax} variables, each named once, and any
 * `envLeftOut` a whole number above 0.
 *
 * @example
 * inboxReachFits({ ...item, risk: "normal", reach: { agent: "Ada" } }); // false
 */
export function inboxReachFits(item: InboxItem): boolean {
  const reach = item.reach;
  if (reach === undefined) return true;
  if (item.risk !== "risky") return false;
  const env = reach.env ?? [];
  const envNames = env.map((each) => each.name);
  if (env.length > inboxReachEnvMax || new Set(envNames).size !== envNames.length) return false;
  const leftOut = reach.envLeftOut;
  if (leftOut !== undefined && !(Number.isInteger(leftOut) && leftOut > 0)) return false;
  const names = [reach.agent, reach.adapter, reach.secret?.name, reach.secret?.settingPath];
  return [...names, ...envNames].every((name) => name === undefined || reachNameFits(name));
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it refuses.
const controlCharacter = /[\u0000-\u001f\u007f]/;

/** Whether `name` fits a reach: not blank, short enough, and on one line. */
export function reachNameFits(name: string): boolean {
  return name.trim() !== "" && name.length <= inboxReachNameMax && !controlCharacter.test(name);
}
