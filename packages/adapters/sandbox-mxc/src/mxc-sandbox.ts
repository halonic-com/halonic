// The Sandbox port on MXC, Windows 11's process container
// (docs/adr/2026-11-10-mxc-sandbox-backend.md): where MXC is offered, whether
// it can start, and the sessions it opens.

import type {
  Sandbox,
  SandboxCapabilities,
  SandboxCheck,
  SandboxProfile,
  SandboxSession,
} from "@halonicjs/ports";
import type { BoxFolders } from "./box-folders.ts";
import { fileDisk, type MxcDisk } from "./disk.ts";
import type { MxcMachine } from "./machine.ts";
import { MxcSession } from "./mxc-session.ts";
import type { MxcSdkSetup } from "./sdk-setup.ts";

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
 * const mxc = new MxcSandbox(systemMachine(), new BoxFolders(dataFolder, process.pid));
 * if (await mxc.offered()) console.log(await mxc.check());
 */
export class MxcSandbox implements Sandbox {
  readonly #machine: MxcMachine;
  readonly #boxes: BoxFolders;
  readonly #disk: MxcDisk;
  readonly #nodeProgram: string;
  readonly #sdkSetup: Pick<MxcSdkSetup, "download"> | undefined;

  /**
   * @param machine - what the adapter asks of this computer and MXC's SDK
   * @param boxes - makes each session's own box folder under Halonic's data folder
   * @param options.disk - the disk; the real one by default
   * @param options.nodeProgram - the Node program the fence proof runs as; the one running Halonic by default
   * @param options.sdkSetup - downloads MXC's SDK when {@link download} is called; without it there is nothing to download
   */
  constructor(
    machine: MxcMachine,
    boxes: BoxFolders,
    options: {
      disk?: MxcDisk;
      nodeProgram?: string;
      sdkSetup?: Pick<MxcSdkSetup, "download">;
    } = {},
  ) {
    this.#machine = machine;
    this.#boxes = boxes;
    this.#disk = options.disk ?? fileDisk;
    this.#nodeProgram = options.nodeProgram ?? process.execPath;
    this.#sdkSetup = options.sdkSetup;
  }

  /**
   * Whether MXC is offered here but its SDK still has to be downloaded once.
   * `check()` says `other` meanwhile. Never throws.
   */
  async downloadNeeded(): Promise<boolean> {
    try {
      if (!(await this.offered())) return false;
      const support = await this.#machine.mxcSupport();
      return !support.loaded && support.needsDownload;
    } catch {
      return false;
    }
  }

  /**
   * Downloads MXC's SDK (see {@link MxcSdkSetup.download}). The host calls it
   * only when the person picks MXC. Never throws.
   */
  async download(): Promise<{ done: true } | { done: false; problem: string }> {
    if (this.#sdkSetup === undefined)
      return { done: false, problem: "there is no download set up" };
    return this.#sdkSetup.download();
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
   * Opens a session in a fresh box and proves its fence before anything runs.
   * A fence that isn't proven opens a session whose `fence` is `not-fenced`
   * and whose `start` throws.
   *
   * @throws when MXC can't start here (see {@link check})
   * @throws when the profile can't be applied: a non-empty `allowedSites`, `reopenedPaths`, a bridge that isn't a loopback bridge on `127.0.0.1`, or a path MXC can't be given
   */
  async open(
    profile: SandboxProfile,
    options: { signal?: AbortSignal } = {},
  ): Promise<SandboxSession> {
    const check = await this.check();
    if (!check.ok) throw new Error(`MXC can't start here: ${check.missing.join(" ")}`);
    return MxcSession.open(
      profile,
      {
        machine: this.#machine,
        boxes: this.#boxes,
        disk: this.#disk,
        nodeProgram: this.#nodeProgram,
      },
      options,
    );
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
