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
 * `halonic tools review | approve` stop with `cantListProgramMissing`,
 * `cantListProgramStopped` (HAL-13731) or `cantListSecretMissing` and their
 * fix (decided on HAL-13829). `halonic run` warns with `notStarted` (or
 * `notListed` when it can't say why, with `notListedFix`, or
 * `integrationNotListedFix` for an integration's connector), then
 * `programMissing`, `programStopped`, `secretMissing`, `pluginNotTrusted`,
 * `pluginChanged` or `pluginStopped` and their fix, and goes on: the run had
 * none of the connector's tools. `programStopped`'s fix is `tools review`'s
 * own, `cantListProgramStoppedFix` (HAL-15606).
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
  /** HAL-15606: `cantListProgramStopped`'s cause, without its "Couldn't list the tools", which `notStarted` says. */
  programStopped: (program: string) =>
    phrase`The program ${program} stopped right after it started.`,
  secretMissing: (secret: string) => phrase`The secret ${secret} isn't set on this computer.`,
  /** `plugin` is the plugin's id; its fix is `pluginMessages.startNotTrustedFix`. */
  pluginNotTrusted: (plugin: string) => phrase`The plugin ${plugin} isn't trusted yet.`,
  /** `plugin` is the plugin's id; its fix is `pluginMessages.startChangedFix`. */
  pluginChanged: (plugin: string) => phrase`The plugin ${plugin} changed since you trusted it.`,
  /**
   * `plugin` is the plugin's name, as `plugin list` shows it: its fix only says what happens
   * next, so it needs no id (C600 #4, HAL-15608, words with Sofia on HAL-15616).
   */
  pluginStopped: (plugin: string) =>
    phrase`The sandbox didn't work when the plugin ${plugin} started, so none of it ran.`,
  pluginStoppedNext: (plugin: string) =>
    phrase`Halonic tries ${plugin} in the sandbox again the next time a run uses it.`,
  /** HAL-13829: line 1 of `tools review | approve` for a connector whose program isn't on this computer. */
  cantListProgramMissing: (connector: string, program: string) =>
    phrase`Couldn't list the tools from ${connector}: its program ${program} isn't on this computer.`,
  /** `file` is the connector's path in the workspace, or `undefined` when it has none. */
  cantListProgramMissingFix: (connector: string, file: string | undefined) =>
    file === undefined
      ? phrase`Install it, or change the command in the ${connector} connector file.`
      : phrase`Install it, or change the command in ${file}.`,
  /** HAL-13731: line 1 of `tools review | approve` for a connector whose program stopped by itself before it answered. */
  cantListProgramStopped: (connector: string, program: string) =>
    phrase`Couldn't list the tools from ${connector}: its program ${program} stopped right after it started.`,
  /**
   * `file` as for `cantListProgramMissingFix`. The command and args, not the program alone:
   * `npx` on its own only prints its help (Sofia, HAL-13732).
   */
  cantListProgramStoppedFix: (connector: string, file: string | undefined) =>
    file === undefined
      ? phrase`To see why, run the command and args from the ${connector} connector file yourself.`
      : phrase`To see why, run the command and args from ${file} yourself.`,
  /**
   * HAL-15620: the lead-in, under `cantListProgramStopped`, to the program's last lines on standard
   * error, in the terminal only, as `--debug`'s "The engine said:" (Sofia).
   */
  programSaid: () => phrase`The program said:`,
  /** HAL-15620: `cantListProgramStoppedFix` once the program's last lines are shown: those are at most 3, cut short. */
  cantListProgramStoppedSaidFix: (connector: string, file: string | undefined) =>
    file === undefined
      ? phrase`To see all of it, run the command and args from the ${connector} connector file yourself.`
      : phrase`To see all of it, run the command and args from ${file} yourself.`,
  /** HAL-13829: line 1 of `tools review | approve` for a connector that needs a secret that isn't set. */
  cantListSecretMissing: (connector: string, secret: string) =>
    phrase`Couldn't list the tools from ${connector}: it needs the secret ${secret}, which isn't set.`,
  cantListSecretMissingFix: (secret: string) => phrase`Set it with: halonic secret set ${secret}`,
  secretMissingFix: (secret: string) =>
    phrase`Save it with halonic secret set ${secret}, or set ${secretVariableName(secret)}, then try again.`,
  /** A plugin connector's backend: the sandbox it runs in can't start here (HAL-14296). */
  sandboxNotReady: () => phrase`The sandbox its plugin runs in can't start on this computer.`,
  sandboxNotReadyFix: () => phrase`See why with halonic doctor.`,
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
  /**
   * HAL-15250: the fix under `notListed` for an integration's connector,
   * which `tools review` doesn't start (HAL-14784). `doctor` checks what its
   * runner needs to start. `dir` is the user's own `--dir`.
   */
  integrationNotListedFix: (dir: string | undefined) =>
    phrase`Its integration needs the sandbox and a trusted workspace to start. To check both, run ${suggestedCommand("doctor", dir)}`,
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
