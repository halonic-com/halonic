import { join } from "node:path";
import { FileSandboxSettingStore } from "@halonicjs/adapter-fs-node";
import {
  type LimitCode,
  type SandboxBackendId,
  SandboxChoiceService,
  type TrustCanary,
} from "@halonicjs/app";
import type { Sandbox } from "@halonicjs/ports";

/**
 * The folder of the person's choice in the profile, `sandbox`, where Studio's shell
 * keeps `sandbox-setting.json` (`agent_host_choice.rs`).
 */
const settingFolderName = "sandbox";

/**
 * The trust canary until the real one exists (HAL-10552). It starts nothing and
 * says the probe program didn't start, so the trust check fails closed:
 * the choice reports `check-failed` with `did-not-start`, never `in-use`. A canary that
 * passed without probing would say the fence was proven when it wasn't.
 */
export const unbuiltCanary: TrustCanary = {
  async profile() {
    throw new Error("The canary for this backend isn't built yet (HAL-10552).");
  },
  async probe() {
    return { started: false, missing: ["The canary for this backend isn't built yet."] };
  },
};

/** What the host knows about the backend it runs. */
export interface HostBackend {
  /** `srt-wsl` when the launcher says the host runs in Halonic's WSL distro, `srt` otherwise. */
  id: Extract<SandboxBackendId, "srt" | "srt-wsl">;
  sandbox: Pick<Sandbox, "check" | "open">;
  canary?: TrustCanary;
}

/**
 * What each backend does not protect, as the design lists it (HAL-3779, 2.3):
 * native srt on Windows has the Windows limits, the others only the one every backend has.
 */
function limitsOf(id: HostBackend["id"], platform: string): LimitCode[] {
  if (id === "srt" && platform === "win32") {
    return [
      "project-folder-writable",
      "name-lookups-leave",
      "kept-roots-readable",
      "schannel-tls-fails",
    ];
  }
  return ["project-folder-writable"];
}

/**
 * The choice service of this host (HAL-10796): the one backend it runs, with the
 * setting saved in the profile. Other backends, such as MXC or the distro's
 * host, are the choice of the host that runs them; Studio puts the answers together.
 */
export function hostSandboxChoice(
  backend: HostBackend,
  profileFolder: string,
  platform: string = process.platform,
): SandboxChoiceService {
  return new SandboxChoiceService({
    platform,
    backends: [
      {
        id: backend.id,
        offered: async () => true,
        sandbox: backend.sandbox,
        limits: limitsOf(backend.id, platform),
        canary: backend.canary ?? unbuiltCanary,
      },
    ],
    settings: new FileSandboxSettingStore(join(profileFolder, settingFolderName)),
  });
}
