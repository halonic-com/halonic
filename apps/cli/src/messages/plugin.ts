import { defineMessages } from "./define.ts";
import { markPart, phrase } from "./phrase.ts";

/** A plugin's state on `plugin list`: Studio's page states (T12). */
export type PluginState = "on" | "notTrusted" | "changed";

const stateWords: Readonly<Record<PluginState, string>> = {
  on: "on",
  notTrusted: "not trusted yet",
  changed: "changed since you trusted it",
};

/**
 * The sentences of `halonic plugin add | list | remove` (cli-output 1.9 and
 * 3.6). The trust check's sections, headings and order are Studio's
 * (microcopy 24 T6–T9); a section shows only when it has something in it.
 * Plugins live in the profile, so nothing here says "into your workspace".
 */
export const pluginMessages = defineMessages("plugin", {
  summary: () => phrase`Add, list or remove plugins`,
  /** What `plugin add` was doing, for "✕ Couldn't add the plugin: …". */
  addAction: () => phrase`add the plugin`,

  /** The live line while the copy is made. */
  copying: (id: string, commit: string) =>
    phrase`Copying ${id} at ${commit} into your plugins folder…`,
  /** With a !, when no commit was given. */
  latestCommit: (commit: string, branch: string) =>
    phrase`Using commit ${commit}, the latest on ${branch}. Add @${commit} to pin it.`,
  /** The check's first line, and the question at its end, framed with [y/N] by the question line. */
  trustQuestion: (name: string) => phrase`Trust ${name} and turn it on?`,
  toolsHeading: () => phrase`Tools for agents`,
  reads: () => phrase`Reads`,
  changesThings: () => phrase`Changes things`,
  sends: () => phrase`Sends`,
  /** After a tool that waits for a person: "post_alert · asks a person first". */
  asksFirst: () => phrase`asks a person first`,
  programsHeading: () => phrase`Programs on this computer`,
  secretsHeading: () => phrase`Secrets`,
  /** After a secret's name: "goes only to api.weather.example". */
  secretGoesTo: (host: string) => phrase`goes only to ${host}`,
  addressesHeading: () => phrase`Addresses`,
  inStudioHeading: () => phrase`In Studio`,
  /** T9's last line, under every plugin trust check. */
  notChecked: () =>
    phrase`Plugin code runs apart from Studio. Halonic doesn't check what the plugin does with what it's given.`,

  added: (name: string, version: string) => phrase`Added ${name} ${version}. It's on.`,
  /** Answer No, or Enter, with a !: added but off, exit 3 (Studio's Not now, D4). */
  addedButOff: (name: string, id: string) =>
    phrase`${name} is added but off. Nothing from it runs until you trust it: halonic trust --plugin ${id}`,
  /**
   * No terminal, or `CI` set, without `--yes --fingerprint`: the copy is made,
   * then it ends as a No does, added but off with a ! and exit 3, in F16's two
   * lines (cli-output 3.6, revision 24).
   */
  addNoTerminal: (name: string) =>
    phrase`${name} is added but off, because there's no terminal to ask you to trust it.`,
  /** The fix names `trust --plugin`, because a second `plugin add` would be a conflict. */
  addNoTerminalFix: (id: string) =>
    phrase`Review it with halonic trust --plugin ${id}, then pass --yes --fingerprint <fingerprint>.`,
  /** After the refusal's reason from the attack-test list; never more detail than the reason. */
  refusedSourceFix: () => phrase`Check the folder or git address.`,

  /** A plugin's state on its `list` line. */
  state: (state: PluginState) => phrase`${stateWords[state]}`,
  /** After a state that needs trust: "! not trusted yet · halonic trust --plugin tides". */
  stateWithFix: (state: Exclude<PluginState, "on">, id: string) =>
    phrase`${stateWords[state]} ${markPart("separator")} halonic trust --plugin ${id}`,
  noPlugins: () => phrase`No plugins yet. Add one with halonic plugin add <folder or git address>.`,

  /** `remove`'s question, framed with [y/N]; a plugin without secrets has the shorter one. */
  removeQuestion: (name: string, hasSecrets: boolean) =>
    hasSecrets
      ? phrase`Remove ${name}? Its settings and the API key you entered are removed from this computer.`
      : phrase`Remove ${name}? Its settings are removed from this computer.`,
  removed: (name: string, version: string) => phrase`Removed ${name} ${version} and its trust.`,
  /** Answer No, or Enter: exit 1. */
  notRemoved: (name: string) => phrase`Not removed. ${name} is still added.`,
  /** No terminal, or `CI` set, without `--yes`: exit 2 (F6). */
  removeNoTerminal: (name: string) =>
    phrase`Removing ${name} deletes its settings and secrets, and there's no terminal to ask you.`,
  removeNoTerminalFix: () => phrase`To remove it anyway, pass --yes.`,
  /** `halonic plugin remove --help` (W11). */
  removeHelp: () =>
    phrase`Removes the plugin and its settings and secrets. To only turn it off: halonic trust --plugin <id> --remove`,
  unknownPlugin: (name: string) => phrase`There's no plugin called "${name}".`,
  unknownPluginNear: (name: string, near: string) =>
    phrase`There's no plugin called "${name}". Did you mean ${near}?`,
  unknownPluginFix: () => phrase`See them with halonic plugin list.`,
});
