import type {
  Sandbox,
  SandboxCapabilities,
  SandboxCheck,
  SandboxProfile,
  SandboxSession,
  SandboxUnavailableReason,
} from "@halonicjs/ports";
import { type Machine, systemMachine } from "./machine.ts";

/** One reason the sandbox can't start, with the sentence that says what is missing. */
interface Unavailable {
  reason: SandboxUnavailableReason;
  missing: string;
}

/**
 * The Sandbox port on sandbox-runtime (srt): bubblewrap on Linux, Seatbelt on
 * macOS. Plain Windows is refused here until its mode is reviewed.
 */
export class SrtSandbox implements Sandbox {
  readonly #machine: Machine;

  constructor(machine: Machine = systemMachine) {
    this.#machine = machine;
  }

  async check(): Promise<SandboxCheck> {
    let unavailable: Unavailable | null;
    try {
      unavailable = await this.#firstUnavailable();
    } catch {
      unavailable = { reason: "other", missing: "the machine could not be examined" };
    }
    if (unavailable === null) return { ok: true, reason: null, missing: [] };
    return { ok: false, reason: unavailable.reason, missing: [unavailable.missing] };
  }

  capabilities(): SandboxCapabilities {
    return { files: "shared", strength: "os" };
  }

  async open(
    _profile: SandboxProfile,
    _options?: { signal?: AbortSignal },
  ): Promise<SandboxSession> {
    const check = await this.check();
    if (!check.ok) throw new Error(`the sandbox can't start: ${check.missing.join("; ")}`);
    throw new Error("sandbox-srt can't open a session yet (HAL-193, next pull request)");
  }

  /** The first reason, in the order the port lists them, because its fix comes first. */
  async #firstUnavailable(): Promise<Unavailable | null> {
    const machine = this.#machine;
    if (machine.platform === "win32") {
      return { reason: "windows", missing: "plain Windows has no sandbox yet; WSL2 does" };
    }
    if (machine.platform === "darwin") {
      return (await machine.hasSeatbelt())
        ? null
        : { reason: "other", missing: "sandbox-exec is not installed" };
    }
    if (machine.platform !== "linux") {
      return { reason: "other", missing: `${machine.platform} has no sandbox` };
    }
    if (await machine.insideContainer()) {
      return { reason: "container", missing: "Halonic runs inside a container" };
    }
    if (await machine.userNamespacesRestricted()) {
      return {
        reason: "user-namespaces-restricted",
        missing: "the system doesn't let programs create user namespaces",
      };
    }
    if (!(await machine.hasBubblewrap())) {
      return { reason: "bubblewrap-missing", missing: "bubblewrap is not installed" };
    }
    return null;
  }
}
