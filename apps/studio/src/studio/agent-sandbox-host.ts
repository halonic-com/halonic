import {
  AgentHostSandbox,
  AgentHostSandboxSetup,
  type AgentHostTransport,
  type SandboxSetupResult,
} from "@halonicjs/adapter-agent-host-client";
import { sandboxStartWords } from "@halonicjs/app";
import type { SandboxUnavailableReason } from "@halonicjs/ports";
import type {
  AgentSandboxHost,
  SandboxCheckFacts,
  SandboxOutcome,
  SecurityUpdatesFacts,
  WslRemoveRequest,
  WslRemoveResult,
} from "@halonicjs/studio-feature-settings";
import type { ElevateSetup, ShellElevation } from "./sandbox-elevate-shell.ts";

/**
 * Setting up fixes `setup-needed`; a repair fixes the two that say part of the setup is there but
 * wrong. Everything else is something the person or an administrator does outside Halonic, so the
 * section gets the reason's code and words it from the catalogue (`sandboxStartWords`, the one the
 * Inbox, the run page and the CLI use), and offers only Check again (`studio.agent-sandbox-host`).
 * The check's own sentence (`missing`) is for logs and support: no screen shows it (23.3).
 */

/**
 * What the shell does for the removal of the WSL setup: its save dialog for the backup, and
 * showing the saved file. It names no path to show: the shell shows the file chosen last.
 */
export interface WslBackupShell {
  choose(suggestedName: string): Promise<string | null>;
  reveal(): Promise<void>;
}

const needsRepair: readonly SandboxUnavailableReason[] = ["distro-missing", "setup-conflict"];

/**
 * The agent host's sandbox as Settings › Agent sandbox reads it: the host's check becomes Ready,
 * Needs setting up (`setup-needed`), Needs repair (part of the setup is there but wrong), Restart
 * needed (Windows must restart to finish the setup) or a check that says why the sandbox can't run
 * now (Unavailable). The setup and the removal start only when the section calls them, from a
 * press, and run until the host says how they ended, however long the administrator prompt takes
 * (HAL-1451).
 */
export class AgentHostSandboxFacts implements AgentSandboxHost {
  readonly available = true;
  readonly #transport: AgentHostTransport;
  readonly #setup: AgentHostSandboxSetup;
  readonly #now: () => Date;
  readonly #elevate: ElevateSetup | undefined;
  readonly securityUpdates?: () => Promise<SecurityUpdatesFacts | null>;
  readonly removeWslSetup?: NonNullable<AgentSandboxHost["removeWslSetup"]>;
  readonly chooseBackupFile?: NonNullable<AgentSandboxHost["chooseBackupFile"]>;
  readonly showInFolder?: NonNullable<AgentSandboxHost["showInFolder"]>;

  /**
   * `wslBackup` is given only where the shell offers the removal of the WSL setup (HAL-10974);
   * without it the section has no **Remove sandbox setup**. `elevate` is given only where the
   * shell starts the setup's helper itself, from Studio's window (HAL-14841); without it the host
   * runs the setup.
   */
  constructor(
    transport: AgentHostTransport,
    setup: AgentHostSandboxSetup = new AgentHostSandboxSetup(transport),
    now: () => Date = () => new Date(),
    securityUpdates?: () => Promise<SecurityUpdatesFacts | null>,
    wslBackup?: WslBackupShell,
    elevate?: ElevateSetup,
  ) {
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
  }

  async check(): Promise<SandboxCheckFacts> {
    const check = await (await AgentHostSandbox.connect(this.#transport)).check();
    if (check.ok) {
      const checkedAt = this.#now().toISOString();
      // W6 (HAL-12445): a warning next to Ready, never a failure.
      return check.residuals?.includes("docker-desktop-visible")
        ? { state: "ready", checkedAt, dockerDesktopVisible: true }
        : { state: "ready", checkedAt };
    }
    if (check.reason === "setup-needed") return { state: "needs-setup" };
    if (check.reason === "restart-needed") return { state: "restart-needed" };
    if (needsRepair.includes(check.reason)) {
      return { state: "needs-repair", reason: sandboxStartWords(check.reason).reason };
    }
    return { state: "unavailable", code: check.reason };
  }

  async running(): Promise<"setup" | "remove" | null> {
    const { running } = await this.#setup.status();
    // The WSL removal is followed by its own dialog, not by the srt section.
    return running === "remove-wsl" ? null : running;
  }

  async setUp(options: { readonly signal?: AbortSignal } = {}): Promise<SandboxOutcome | null> {
    if (this.#elevate !== undefined) return this.#setUpThroughShell(await this.#elevate());
    const started = await this.#setup.startSetUp();
    if (started.running === null) {
      return started.last?.verb === "setup" ? outcomeOf("setup", started.last.result) : null;
    }
    return outcomeOf("setup", (await this.#setup.ended("setup", options))?.result);
  }

  async remove(options: { readonly signal?: AbortSignal } = {}): Promise<SandboxOutcome | null> {
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
      case "failed": {
        const reason = `Windows couldn't start the sandbox helper: ${elevated.reason.replace(/\.+$/, "")}.`;
        return { kind: "setup", how: "failed", reason };
      }
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
  ): Promise<SandboxOutcome | null | undefined> {
    const ended = await this.#setup.ended(verb, options);
    if (options.signal?.aborted && ended === undefined) return undefined;
    return outcomeOf(verb, ended?.result);
  }
}

/** What a finished setup or removal leaves for the section: nothing when it worked. */
function outcomeOf(
  kind: "setup" | "remove",
  result: SandboxSetupResult | undefined,
): SandboxOutcome | null {
  if (result === undefined) {
    return { kind, how: "failed", reason: "the host stopped before it said how it ended." };
  }
  if (result.ok) return null;
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
