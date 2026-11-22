/**
 * The services and types other features may use. Features import each other only through this
 * file. Any feature opens Check this computer by running {@link checkComputerCommand}, as Settings'
 * **Open Models** runs the Workspace feature's command; the app provides
 * {@link CheckComputerSourceService} for each open folder.
 */
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { CheckFact } from "./check-facts.ts";

export type {
  CheckFact,
  CheckLineId,
  EngineFact,
  GoogleFact,
  HostFact,
  LastRunFact,
  ModelKey,
  ModelsFact,
  ModelTest,
  NotCheckedFact,
  NotCheckedPart,
  SandboxFact,
  SandboxKind,
} from "./check-facts.ts";

/**
 * The command that opens Check this computer, for every **Something wrong?** (first-run-progress
 * 4.5): `context.runCommand?.(checkComputerCommand)`.
 */
export const checkComputerCommand = "check-computer.open";

/**
 * Where the dialog's facts come from, for the open folder: the agent host's doctor for the lines
 * that need Node, and Studio's own knowledge for the others. It changes nothing and sends nothing
 * to a provider: a model test runs only when the person presses **Test again** (4.2).
 */
export interface CheckComputerSource {
  /** Halonic's version and the system, for the Engine line and the report: "Halonic 0.1.0 · macOS arm64". */
  readonly about: string;
  /** Whether the open folder is the demo, which the dialog shows with the demo's lines. */
  isDemo(): boolean;
  /**
   * Runs the checks and gives each line's facts as soon as its check answers, so a slow check
   * doesn't hold up the others (4.1). A check that fails gives no line rather than a wrong one;
   * the iteration ends when every check has answered, or when `signal` aborts.
   */
  check(signal: AbortSignal): AsyncIterable<CheckFact>;
}

/** The facts of Check this computer for the open folder, provided by the app. It is optional. */
export const CheckComputerSourceService: ServiceKey<CheckComputerSource> =
  serviceKey<CheckComputerSource>("check-computer.source");
