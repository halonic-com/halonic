// The Sandbox port on MXC, Windows 11's process container
// (docs/adr/2026-11-10-mxc-sandbox-backend.md). This first part says where
// MXC is offered and whether it can start; sessions follow in the next pull
// request of HAL-3305, so `open` refuses for now.

import type {
  Sandbox,
  SandboxCapabilities,
  SandboxCheck,
  SandboxProfile,
  SandboxSession,
} from "@halonicjs/ports";
import type { MxcMachine } from "./machine.ts";

/** Windows 11's first build. Windows 10 stops below it. */
const firstWindows11Build = 22000;

/** The only tier the adapter uses: the DACL tier (what Windows Server gets) leaked `deniedPaths` (HAL-2396). */
const baseContainer = "base-container";

/**
 * The Sandbox port on MXC. Offered only on Windows 11 client editions where
 * MXC's SDK reports the BaseContainer tier with the loopback proxy; on every
 * other computer it isn't offered, and `check()` says `windows`, as plain
 * Windows does today. Not offered is not a failure: there is no trust check
 * and no session.
 *
 * @example
 * const mxc = new MxcSandbox(systemMachine());
 * if (await mxc.offered()) console.log(await mxc.check());
 */
export class MxcSandbox implements Sandbox {
  readonly #machine: MxcMachine;

  constructor(machine: MxcMachine) {
    this.#machine = machine;
  }

  /**
   * Whether this computer offers MXC at all. Never throws: a computer that
   * can't be examined doesn't offer it. When the SDK itself can't be loaded
   * on a Windows 11 client edition, MXC counts as offered, so {@link check}
   * reports the broken install instead of hiding it.
   */
  async offered(): Promise<boolean> {
    try {
      const refusal = await this.#refusal();
      return refusal === null || refusal.reason === "other";
    } catch {
      // Unknown means not offered: hidden is the safe side, and check() reports the error.
      return false;
    }
  }

  /** Whether MXC can start here; when not, `windows` where it isn't offered, else `other`. */
  async check(): Promise<SandboxCheck> {
    try {
      const refusal = await this.#refusal();
      if (refusal === null) return { ok: true, reason: null, missing: [] };
      return { ok: false, reason: refusal.reason, missing: [refusal.missing] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        reason: "other",
        missing: [`This computer can't be examined: ${message}`],
      };
    }
  }

  /** Files are shared with the host, fenced by the operating system. */
  capabilities(): SandboxCapabilities {
    return { files: "shared", strength: "os" };
  }

  /**
   * Opens nothing yet: sessions come in the next pull request of HAL-3305.
   *
   * @throws always: with what is missing when MXC can't start here, else because sessions aren't built yet
   */
  async open(_profile: SandboxProfile): Promise<SandboxSession> {
    const check = await this.check();
    if (!check.ok) throw new Error(`MXC can't start here: ${check.missing.join(" ")}`);
    throw new Error("MXC sessions aren't built yet (HAL-3305).");
  }

  /** Why MXC can't start here, or `null` when it can. Edition first, so other systems never load the SDK. */
  async #refusal(): Promise<{ reason: "windows" | "other"; missing: string } | null> {
    const machine = this.#machine;
    if (machine.platform !== "win32") {
      return { reason: "windows", missing: "MXC runs only on Windows 11." };
    }
    const { build, productName } = machine.windowsRelease();
    if (/\bServer\b/i.test(productName)) {
      return {
        reason: "windows",
        missing: `MXC is offered only on Windows 11 client editions, and this is ${productName}.`,
      };
    }
    if (build < firstWindows11Build) {
      return {
        reason: "windows",
        missing: `MXC needs Windows 11, and this is Windows build ${build}.`,
      };
    }
    const support = await machine.mxcSupport();
    if (!support.loaded) return { reason: "other", missing: support.problem };
    if (support.tier !== baseContainer) {
      const tier = support.tier ?? "no tier";
      return {
        reason: "windows",
        missing: `MXC's BaseContainer tier isn't available here (the SDK reports ${tier}).`,
      };
    }
    if (!support.loopbackProxy) {
      return {
        reason: "windows",
        missing: "MXC's BaseContainer tier here can't use the loopback proxy the bridge needs.",
      };
    }
    return null;
  }
}
