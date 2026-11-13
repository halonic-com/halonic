import {
  AgentHostSandbox,
  AgentHostSandboxSetup,
  type AgentHostTransport,
  type SandboxSetupResult,
} from "@halonicjs/adapter-agent-host-client";
import type { SandboxUnavailableReason } from "@halonicjs/ports";
import type {
  AgentSandboxHost,
  SandboxCheckFacts,
  SandboxOutcome,
} from "@halonicjs/studio-feature-settings";

/**
 * The words for a check that fails, one sentence per reason, ending in a full stop. Setting up
 * fixes `setup-needed`; a repair fixes the two that say part of the setup is there but wrong.
 * Everything else is something the person or an administrator does outside Halonic, so the
 * section says what is wrong and offers only Check again (`studio.agent-sandbox-host`).
 */
const reasons: Record<SandboxUnavailableReason, string> = {
  windows: "this build can't run the sandbox on Windows.",
  container: "Halonic runs inside a container, which can't hold the sandbox.",
  "not-supported": "this version of the operating system can't run the sandbox.",
  "blocked-by-policy": "a policy on this computer blocks the sandbox.",
  "virtualisation-off": "hardware virtualisation is off.",
  "wsl-missing": "Windows Subsystem for Linux isn't installed.",
  "restart-needed": "Windows needs to restart first.",
  "distro-missing": "the sandbox's Linux image isn't installed.",
  "setup-conflict": "the sandbox's setup belongs to another program.",
  "setup-needed": "the sandbox isn't set up.",
  "user-namespaces-restricted": "the system doesn't let programs create user namespaces.",
  "bubblewrap-missing": "bubblewrap isn't installed.",
  "linux-tools-missing": "socat or ripgrep isn't installed.",
  "ripgrep-missing": "ripgrep isn't installed.",
  "sign-in-needed": "the sandbox needs you to sign in.",
  other: "the check failed for a reason Halonic doesn't know.",
};

const needsRepair: readonly SandboxUnavailableReason[] = ["distro-missing", "setup-conflict"];

/**
 * The agent host's sandbox as Settings › Agent sandbox reads it: the host's check becomes Ready,
 * Needs setting up (`setup-needed`), Needs repair (part of the setup is there but wrong) or a
 * check that says why the sandbox can't run now (Unavailable). The setup and the removal start only when the section calls
 * them, from a press, and run until the host says how they ended, however long the administrator
 * prompt takes (HAL-1451).
 */
export class AgentHostSandboxFacts implements AgentSandboxHost {
  readonly available = true;
  readonly #transport: AgentHostTransport;
  readonly #setup: AgentHostSandboxSetup;
  readonly #now: () => Date;

  constructor(
    transport: AgentHostTransport,
    setup: AgentHostSandboxSetup = new AgentHostSandboxSetup(transport),
    now: () => Date = () => new Date(),
  ) {
    this.#transport = transport;
    this.#setup = setup;
    this.#now = now;
  }

  async check(): Promise<SandboxCheckFacts> {
    const check = await (await AgentHostSandbox.connect(this.#transport)).check();
    if (check.ok) return { state: "ready", checkedAt: this.#now().toISOString() };
    const reason =
      check.reason === "other" && check.missing[0] !== undefined
        ? `${check.missing[0].replace(/\.+$/, "")}.`
        : reasons[check.reason];
    if (check.reason === "setup-needed") return { state: "needs-setup" };
    if (check.reason === "restart-needed") return { state: "restart-needed" };
    if (needsRepair.includes(check.reason)) return { state: "needs-repair", reason };
    return { state: "unavailable", reason };
  }

  async running(): Promise<"setup" | "remove" | null> {
    return (await this.#setup.status()).running;
  }

  async setUp(options: { readonly signal?: AbortSignal } = {}): Promise<SandboxOutcome | null> {
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
