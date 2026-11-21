import { secretVariableName } from "@halonicjs/adapter-env-secrets";
import { shellWord } from "../output/shell-word.ts";
import { defineMessages } from "./define.ts";
import { markPart, phrase } from "./phrase.ts";
import { suggestedCommand } from "./suggested-command.ts";

/** The part of a connector a `connector.part-off` names: its backend, or a program, by its name escaped. */
export type ShownPart =
  | { readonly kind: "backend" }
  | { readonly kind: "program"; readonly name: string };

/**
 * Why a connector's program didn't start, in the words Studio's pages use
 * (`connector-failure.ts` of `@halonicjs/adapter-agent-host-client`, UX
 * check C2, HAL-12410), and the one next step. A line names the program or
 * the secret as the connector's file writes it, never a secret's value or
 * the error's own text. Fix lines: Tomas with Sofia, HAL-13670.
 *
 * `halonic tools review | approve` stop with `cantListProgramMissing` or
 * `cantListSecretMissing` and their fix (decided on HAL-13829). `halonic
 * run` warns with `notStarted` (or `notListed` when it can't say why), then
 * `programMissing`, `secretMissing`, `pluginNotTrusted` or `pluginChanged`
 * and their fix, and goes on: the run had none of the connector's tools.
 * Its line 1 already says the connector didn't start, so its cause line
 * doesn't say it again. The plugin lines use `plugin list`'s words for the
 * plugin's state, and their fix is `pluginMessages`' (HAL-14974).
 */
export const connectorStartMessages = defineMessages("connectorStart", {
  programMissing: (program: string) => phrase`The program ${program} isn't on this computer.`,
  /** `file` is the connector's path in the workspace, or `undefined` when it has none (Sofia, HAL-13685). */
  programMissingFix: (program: string, connector: string, file: string | undefined) =>
    file === undefined
      ? phrase`Install ${program}, or change the command in the ${connector} connector file.`
      : phrase`Install ${program}, or change the command in ${file}.`,
  secretMissing: (secret: string) => phrase`The secret ${secret} isn't set on this computer.`,
  /** `plugin` is the plugin's id; its fix is `pluginMessages.startNotTrustedFix`. */
  pluginNotTrusted: (plugin: string) => phrase`The plugin ${plugin} isn't trusted yet.`,
  /** `plugin` is the plugin's id; its fix is `pluginMessages.startChangedFix`. */
  pluginChanged: (plugin: string) => phrase`The plugin ${plugin} changed since you trusted it.`,
  /** HAL-13829: line 1 of `tools review | approve` for a connector whose program isn't on this computer. */
  cantListProgramMissing: (connector: string, program: string) =>
    phrase`Couldn't list the tools from ${connector}: its program ${program} isn't on this computer.`,
  /** `file` is the connector's path in the workspace, or `undefined` when it has none. */
  cantListProgramMissingFix: (connector: string, file: string | undefined) =>
    file === undefined
      ? phrase`Install it, or change the command in the ${connector} connector file.`
      : phrase`Install it, or change the command in ${file}.`,
  /** HAL-13829: line 1 of `tools review | approve` for a connector that needs a secret that isn't set. */
  cantListSecretMissing: (connector: string, secret: string) =>
    phrase`Couldn't list the tools from ${connector}: it needs the secret ${secret}, which isn't set.`,
  cantListSecretMissingFix: (secret: string) => phrase`Set it with: halonic secret set ${secret}`,
  secretMissingFix: (secret: string) =>
    phrase`Save it with halonic secret set ${secret}, or set ${secretVariableName(secret)}, then try again.`,
  notStarted: (connector: string) =>
    phrase`${markPart("needsYou")} ${connector} didn't start, so its tools are off in this run.`,
  notListed: (connector: string) =>
    phrase`${markPart("needsYou")} ${connector} couldn't list its tools, so they are off in this run.`,
  /** `connector` is the id as the workspace writes it, and `dir` the user's own `--dir`. */
  notListedFix: (connector: string, dir: string | undefined) =>
    phrase`To see why, run ${suggestedCommand("tools review", dir, shellWord(connector))}`,
  /**
   * HAL-15081: line 1 of `runs show` for a part of a connector that the run's log says was off
   * (`connector.part-off`), in the shape of `run`'s plugin part warning. The log names the
   * connector, not the plugin.
   */
  partOff: (connector: string, part: ShownPart) =>
    part.kind === "backend"
      ? phrase`${markPart("needsYou")} The backend of ${connector} didn't start, so its tools are off in this run.`
      : phrase`${markPart("needsYou")} The program ${part.name} of ${connector} didn't start, so its tools are off in this run.`,
  /** HAL-15081: the line under `partOff` for a reason the log gives by its code; Tomas, decided by the team. */
  partOffNeedsDesktopApp: () => phrase`It runs only in the Halonic desktop app.`,
  partOffSandboxUnavailable: () => phrase`The sandbox it runs in can't start on this computer.`,
  partOffSandboxNotFenced: () =>
    phrase`Halonic couldn't confirm that the sandbox limits this program on this computer.`,
  partOffNetworkNeedsSrt: () =>
    phrase`It reaches the network, and the Windows 11 sandbox can't limit a program to single sites yet.`,
  partOffSettingsNotSet: () => phrase`A setting it needs has no value.`,
  partOffNotTrusted: () => phrase`Your trust doesn't cover it as it is now.`,
  /** HAL-13714: an `http` connector where nothing answers at its address. Mateo, decided by the team. */
  nothingAnswered: (address: string) => phrase`Nothing answered at ${address}.`,
  nothingAnsweredFix: (connector: string, file: string | undefined) =>
    file === undefined
      ? phrase`Start its server, or change the address in the ${connector} connector file.`
      : phrase`Start its server, or change the address in ${file}.`,
  /** HAL-13714: Studio's `stopped`, for the server of a connector that stopped before it listed its tools. */
  stopped: (connector: string) =>
    phrase`The ${connector} server stopped, or didn't answer in time, before it listed its tools.`,
  stoppedFix: () => phrase`Check that its server starts and works on its own, then try again.`,
});
