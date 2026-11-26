import {
  AgentHostSandbox,
  AgentHostSandboxSetup,
  type AgentHostTransport,
  type SandboxSetupResult,
  type SandboxSetupStatus,
} from "@halonicjs/adapter-agent-host-client";
import type { SandboxCheck } from "@halonicjs/ports";
import type {
  AgentSandboxHost,
  SandboxCheckFacts,
  SandboxOutcome,
  SandboxRemoved,
  SecurityUpdatesFacts,
  WslRemoveRequest,
  WslRemoveResult,
} from "@halonicjs/studio-feature-settings";
import { AgentHostNotAnswering } from "@halonicjs/studio-services";
import type { ElevateHelper, ShellElevation } from "./sandbox-elevate-shell.ts";
import type { WslSetupHelper } from "./sandbox-wsl-setup-shell.ts";
import { wslSetupOutcome } from "./wsl-setup-words.ts";

/**
 * Setting up fixes `setup-needed`, and `distro-missing` where the shell runs the WSL setup
 * (HAL-16765). Everything else is something the person or an administrator does outside Halonic,
 * so the section gets the reason's code and words it from the catalogue (`sandboxStartWords`, the
 * one the Inbox, the run page and the CLI use), and offers only Check again
 * (`studio.agent-sandbox-host`). That includes `setup-conflict` and `runtime-missing`: srt's own
 * setup won't replace another program's filters, and the runtime goes in each time the host starts
 * in the distro, so a Repair button would fail (HAL-16200). The check's own sentence (`missing`)
 * is for logs and support: no screen shows it (23.3).
 */

/**
 * What the shell does for the removal of the WSL setup: its save dialog for the backup, and
 * showing the saved file. It names no path to show: the shell shows the file chosen last.
 */
export interface WslBackupShell {
  choose(suggestedName: string): Promise<string | null>;
  reveal(): Promise<void>;
}

/** The reason when the shell couldn't start the helper or wait for it (C525-7, HAL-15013). */
const HELPER_DIDNT_START = "Windows couldn't start Halonic's sandbox helper.";

/**
 * The agent host's sandbox as Settings › Agent sandbox reads it: the host's check becomes Ready,
 * Needs setting up (`setup-needed`), Restart needed (Windows must restart to finish the setup) or
 * a check that says why the sandbox can't run now (Unavailable). The setup and the removal start only when the section calls them, from a
 * press, and run until the host says how they ended, however long the administrator prompt takes
 * (HAL-1451).
 */
export class AgentHostSandboxFacts implements AgentSandboxHost {
  readonly available = true;
  /**
   * Whether the Studio's runs start an agent outside its sandbox, as the agent host says
   * (`GET /v1/sandbox/this-computer`): the Harness page's answer too. The cautious `false` until
   * the host answers.
   */
  get studioStartsUnfenced(): boolean {
    return this.#startsUnfenced;
  }
  #startsUnfenced = false;
  readonly #transport: AgentHostTransport;
  readonly #setup: AgentHostSandboxSetup;
  readonly #now: () => Date;
  readonly #elevate: ElevateHelper | undefined;
  readonly #wslSetup: WslSetupHelper | undefined;
  /** The last WSL setup said Windows must restart; this Studio hasn't started since. */
  #restartNeeded = false;
  readonly securityUpdates?: () => Promise<SecurityUpdatesFacts | null>;
  readonly removeWslSetup?: NonNullable<AgentSandboxHost["removeWslSetup"]>;
  readonly chooseBackupFile?: NonNullable<AgentSandboxHost["chooseBackupFile"]>;
  readonly showInFolder?: NonNullable<AgentSandboxHost["showInFolder"]>;

  /**
   * `wslBackup` is given only where the shell offers the removal of the WSL setup (HAL-10974);
   * without it the section has no **Remove sandbox setup**. `elevate` is given only where the
   * shell starts the helper itself, from Studio's window (HAL-14841); without it the host runs the
   * setup and the removal. `studioStartsUnfenced` is the host's answer, or its coming answer,
   * which the section reads once it's in (HAL-19599); false when left out. `wslSetup` is given only where the host runs in Halonic's WSL
   * distro on Windows (HAL-16765): **Set up** then runs the WSL setup through the shell.
   */
  constructor(
    transport: AgentHostTransport,
    setup: AgentHostSandboxSetup = new AgentHostSandboxSetup(transport),
    now: () => Date = () => new Date(),
    securityUpdates?: () => Promise<SecurityUpdatesFacts | null>,
    wslBackup?: WslBackupShell,
    elevate?: ElevateHelper,
    studioStartsUnfenced: boolean | Promise<boolean> = false,
    wslSetup?: WslSetupHelper,
  ) {
    if (typeof studioStartsUnfenced === "boolean") this.#startsUnfenced = studioStartsUnfenced;
    else
      studioStartsUnfenced.then(
        (answer) => {
          this.#startsUnfenced = answer;
        },
        // It stays the cautious false.
        (error: unknown) => console.error("Asking the agent host about sessions", error),
      );
    if (securityUpdates !== undefined) this.securityUpdates = securityUpdates;
    if (wslBackup !== undefined) {
      this.removeWslSetup = (request, options) => this.#removeWsl(request, options);
      this.chooseBackupFile = (suggestedName) => wslBackup.choose(suggestedName);
      this.showInFolder = () => wslBackup.reveal();
    }
    this.#transport = transport;
    this.#setup = setup;
    this.#now = now;
    this.#elevate = elevate;
    this.#wslSetup = wslSetup;
  }

  async check(): Promise<SandboxCheckFacts> {
    let check: SandboxCheck;
    try {
      check = await (await AgentHostSandbox.connect(this.#transport)).check();
    } catch (error) {
      const reason = refusedFor(error);
      if (reason === undefined) throw error;
      return this.#refusedCheck(reason);
    }
    if (check.ok) {
      const checkedAt = this.#now().toISOString();
      // W6 (HAL-12445): a warning next to Ready, never a failure.
      return check.residuals?.includes("docker-desktop-visible")
        ? { state: "ready", checkedAt, dockerDesktopVisible: true }
        : { state: "ready", checkedAt };
    }
    if (check.reason === "setup-needed") {
      return {
        state: "needs-setup",
        ...(check.setupAgain === true ? { setupAgain: true } : {}),
        // HAL-15851: Settings offers to remove it again.
        ...(check.accessKept === true ? { accessKept: true } : {}),
      };
    }
    if (check.reason === "restart-needed") return { state: "restart-needed" };
    return { state: "unavailable", code: check.reason };
  }

  /**
   * What the section reads when the shell couldn't start the host, for a sandbox reason such as
   * `distro-missing` (HAL-16765): with the WSL setup, a missing distro needs setting up, and after a
   * setup that asked for a restart, the host can't start until Windows has restarted.
   */
  #refusedCheck(reason: string): SandboxCheckFacts {
    if (this.#wslSetup !== undefined) {
      if (this.#restartNeeded) return { state: "restart-needed" };
      // Importing the distro asks for no administrator rights (HAL-16780).
      if (reason === "distro-missing") return { state: "needs-setup", withoutAdmin: true };
    }
    return { state: "unavailable", code: reason };
  }

  async running(): Promise<"setup" | "remove" | null> {
    let status: SandboxSetupStatus;
    try {
      status = await this.#setup.status();
    } catch (error) {
      // No host to ask, as before the WSL setup: nothing runs in it. The shell's own setup is
      // joined by a press, which answers that it still runs.
      if (this.#wslSetup !== undefined && refusedFor(error) !== undefined) return null;
      throw error;
    }
    const { running } = status;
    // The WSL removal is followed by its own dialog, not by the srt section.
    return running === "remove-wsl" ? null : running;
  }

  async setUp(options: { readonly signal?: AbortSignal } = {}): Promise<SandboxOutcome | null> {
    if (this.#wslSetup !== undefined) return this.#setUpWsl(this.#wslSetup);
    if (this.#elevate !== undefined) return this.#setUpThroughShell(await this.#elevate("setup"));
    const started = await this.#setup.startSetUp();
    if (started.running === null) {
      return started.last?.verb === "setup" ? outcomeOf("setup", started.last.result) : null;
    }
    return outcomeOf("setup", (await this.#setup.ended("setup", options))?.result);
  }

  async remove(
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<SandboxOutcome | SandboxRemoved | null> {
    if (this.#elevate !== undefined) return this.#removeThroughShell(this.#elevate);
    const started = await this.#setup.startRemove();
    if ("inUse" in started) return { kind: "remove", how: "in-use", runs: started.inUse };
    if (started.running === null) {
      return started.last?.verb === "remove" ? outcomeOf("remove", started.last.result) : null;
    }
    return outcomeOf("remove", (await this.#setup.ended("remove", options))?.result);
  }

  /**
   * How a setup the shell started ended. Only an exit code goes to the host, which checks the
   * sandbox itself: the code alone never counts as set up. The shell can't tell a repair from a
   * setup; the section words those two outcomes for the press it made.
   */
  async #setUpThroughShell(elevated: ShellElevation): Promise<SandboxOutcome | null> {
    switch (elevated.outcome) {
      case "exited":
        return outcomeOf("setup", await this.#setup.afterHelper(elevated.exitCode));
      case "cancelled":
        return { kind: "setup", how: "cancelled" };
      case "timed_out":
        return { kind: "setup", how: "timed-out", repairing: false };
      case "still_running":
        return { kind: "setup", how: "still-running", repairing: false };
      case "failed":
        // Windows' own message and code go only into Copy details (microcopy 1.6, 22 F13); the
        // same line covers a wait that failed after the helper had started (C525-7, HAL-15013).
        return {
          kind: "setup",
          how: "failed",
          reason: HELPER_DIDNT_START,
          details: elevated.reason,
        };
    }
  }

  /**
   * Sets Halonic's WSL distro up through the shell (HAL-16765). When it is done the shell has
   * started the host in the distro, and the section's check reads it; when Windows must restart,
   * the check says Restart needed until it has.
   */
  async #setUpWsl(wslSetup: WslSetupHelper): Promise<SandboxOutcome | null> {
    const answer = await wslSetup();
    if (answer.outcome === "restart_needed") this.#restartNeeded = true;
    if (answer.outcome === "done") this.#restartNeeded = false;
    return wslSetupOutcome(answer);
  }

  /**
   * Removes the sandbox through the shell (HAL-14841). The host does its half first, before any
   * prompt: it refuses while runs use the sandbox and takes back the access the sandbox kept on
   * the person's folders. Only then does the shell start the helper, and only its exit code goes
   * back to the host, which says how the removal ended.
   */
  async #removeThroughShell(
    elevate: ElevateHelper,
  ): Promise<SandboxOutcome | SandboxRemoved | null> {
    const before = await this.#setup.beforeRemoveHelper();
    if ("inUse" in before) return { kind: "remove", how: "in-use", runs: before.inUse };
    if (!before.ok) return outcomeOf("remove", before);
    const elevated = await elevate("remove");
    switch (elevated.outcome) {
      case "exited":
        return outcomeOf("remove", await this.#setup.afterRemoveHelper(elevated.exitCode));
      case "cancelled":
        return { kind: "remove", how: "cancelled" };
      // The section words these two in the setup's words (HAL-14863, HAL-15091).
      case "timed_out":
        return { kind: "remove", how: "timed-out" };
      case "still_running":
        return { kind: "remove", how: "still-running" };
      case "failed":
        // As for the setup: Windows' own message goes only into Copy details (C525-7, HAL-15013).
        return {
          kind: "remove",
          how: "failed",
          reason: HELPER_DIDNT_START,
          details: elevated.reason,
        };
    }
  }

  /**
   * Removes the WSL setup and waits for how the host says it ended. A refusal to start (busy) or
   * a host that stopped without an answer throws, so the dialog tells the person it can't say.
   */
  async #removeWsl(
    request: WslRemoveRequest,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<WslRemoveResult> {
    const started = await this.#setup.startRemoveWsl(request);
    if ("inUse" in started) throw new Error("Sandboxed runs are still using the sandbox.");
    const last =
      started.running === null ? started.last : await this.#setup.ended("remove-wsl", options);
    if (last?.verb !== "remove-wsl") throw new Error("The host did not say how it ended.");
    if ("ok" in last.result) throw new Error(last.result.reason);
    return last.result;
  }

  /** Follows the command that runs, with `GET`s only: it starts nothing. */
  async follow(
    verb: "setup" | "remove",
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<SandboxOutcome | SandboxRemoved | null | undefined> {
    const ended = await this.#setup.ended(verb, options);
    if (options.signal?.aborted && ended === undefined) return undefined;
    return outcomeOf(verb, ended?.result);
  }
}

/**
 * The sandbox reason the shell gave for a host it couldn't start, such as `distro-missing`, or
 * undefined for any other failure.
 */
function refusedFor(error: unknown): string | undefined {
  return error instanceof AgentHostNotAnswering ? error.reason : undefined;
}

/**
 * What a finished setup or removal leaves for the section: nothing when it worked, except a
 * removal that kept some access (`sandbox-srt.removal-kept-access`).
 */
function outcomeOf(kind: "setup", result: SandboxSetupResult | undefined): SandboxOutcome | null;
function outcomeOf(
  kind: "setup" | "remove",
  result: SandboxSetupResult | undefined,
): SandboxOutcome | SandboxRemoved | null;
function outcomeOf(
  kind: "setup" | "remove",
  result: SandboxSetupResult | undefined,
): SandboxOutcome | SandboxRemoved | null {
  if (result === undefined) {
    return { kind, how: "failed", reason: "the host stopped before it said how it ended." };
  }
  if (result.ok) {
    return kind === "remove" && result.keptAccess !== undefined
      ? { kind, how: "removed", keptAccess: result.keptAccess }
      : null;
  }
  const reason = result.reason.replace(/\.+$/, "");
  const sentence = `${reason}.`;
  if (kind === "remove") {
    return result.outcome === "cancelled"
      ? { kind, how: "cancelled" }
      : { kind, how: "failed", reason: sentence };
  }
  return result.outcome === "cancelled"
    ? { kind, how: "cancelled" }
    : { kind, how: result.outcome, reason: sentence };
}
