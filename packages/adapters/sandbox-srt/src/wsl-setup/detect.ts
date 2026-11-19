import type { SandboxUnavailableReason } from "@halonicjs/ports";
import type { ProgramResult, WslHost } from "./host.ts";

/** The first Windows build with WSL 2: Windows 10 version 2004. */
export const FIRST_WSL2_BUILD = 19041;

/**
 * The oldest WSL kernel the trust check accepts (W11). Below it the setup
 * offers `wsl --update`. Security confirmed the value on HAL-10557; it is one
 * number here so changing it changes nothing else.
 */
export const WSL_KERNEL_FLOOR = "5.15.153.1";

/** `ERROR_SUCCESS_REBOOT_REQUIRED`: the install worked and Windows must restart. */
export const EXIT_RESTART_REQUIRED = 3010;

/** What the setup can say about WSL, short of working: a closed list of reasons from the port, or `null` when WSL is ready for the distro. */
export type WslProblem = Extract<
  SandboxUnavailableReason,
  | "not-supported"
  | "blocked-by-policy"
  | "virtualisation-off"
  | "wsl-missing"
  | "restart-needed"
  | "distro-missing"
>;

const virtualisationOff =
  /0x80370102|0x80370114|HCS_E_HYPERV_NOT_INSTALLED|virtuali[sz]ation (is )?(not enabled|disabled|turned off)|enable virtuali[sz]ation|virtual machine platform/i;
const notInstalled =
  /not installed|isn't installed|is not recognized|0x80070002|install .*windows subsystem for linux|wsl\.exe --install/i;
const restartWords = /restart|reboot|0x80070bc2/i;

/** Whether text from `wsl` says hardware virtualisation is off. */
export function saysVirtualisationOff(text: string): boolean {
  return virtualisationOff.test(text);
}

/** Whether text from `wsl` says a restart is needed. */
export function saysRestartNeeded(text: string): boolean {
  return restartWords.test(text);
}

/**
 * Reads a dotted kernel version such as `5.15.153.1-2` as numbers.
 *
 * @example
 * parseKernelVersion("Kernel version: 5.15.153.1-2"); // [5, 15, 153, 1]
 */
export function parseKernelVersion(text: string): number[] | null {
  const found = /(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?/.exec(text);
  if (found === null) return null;
  return found
    .slice(1)
    .filter((part) => part !== undefined)
    .map(Number);
}

/**
 * Whether `found` is at least `floor`, comparing part by part (a missing part is 0).
 *
 * @example
 * kernelAtLeast([5, 10, 16, 3], [5, 15, 153, 1]); // false
 */
export function kernelAtLeast(found: number[], floor: number[]): boolean {
  for (let index = 0; index < Math.max(found.length, floor.length); index++) {
    const a = found[index] ?? 0;
    const b = floor[index] ?? 0;
    if (a !== b) return a > b;
  }
  return true;
}

/**
 * Reads the kernel version from `uname -r` run inside the distro, or `null`.
 * Not from `wsl --version`: the Store build of WSL translates its labels.
 */
export function kernelOf(uname: ProgramResult): number[] | null {
  return uname.code === 0 ? parseKernelVersion(uname.output) : null;
}

/**
 * What stops WSL from getting the distro, first listed first: an old Windows,
 * a company policy, WSL missing, a restart that hasn't happened, virtualisation
 * off, the distro missing. `null` means WSL runs and Halonic's distro is there.
 * Reads `wsl --status`, the distro list and the policy key; never changes anything.
 *
 * @param restartPending whether the saved state is `restart-needed` and Windows hasn't restarted since
 */
export async function detectWslProblem(
  host: WslHost,
  distro: string,
  restartPending: boolean,
): Promise<{ problem: WslProblem | null; detail: string }> {
  const build = await host.windowsBuild();
  if (build === null || build < FIRST_WSL2_BUILD) {
    return {
      problem: "not-supported",
      detail: `Windows build ${build ?? "unknown"} can't run WSL 2`,
    };
  }
  if ((await host.policy()).allowWsl === 0) {
    return { problem: "blocked-by-policy", detail: "the AllowWSL policy is 0" };
  }
  if (restartPending) return { problem: "restart-needed", detail: "Windows hasn't restarted yet" };
  const status = await host.status();
  const text = status.output;
  if (saysVirtualisationOff(text))
    return { problem: "virtualisation-off", detail: firstLine(text) };
  if (status.code === null || (status.code !== 0 && notInstalled.test(text))) {
    return { problem: "wsl-missing", detail: firstLine(text) || "wsl.exe didn't start" };
  }
  if (status.code !== 0) {
    // WSL answers but isn't usable: a restart if it says so, else treat it as missing.
    return saysRestartNeeded(text)
      ? { problem: "restart-needed", detail: firstLine(text) }
      : { problem: "wsl-missing", detail: firstLine(text) };
  }
  const found = (await host.distros()).some((entry) => entry.name === distro);
  return found
    ? { problem: null, detail: "" }
    : { problem: "distro-missing", detail: `the distro "${distro}" isn't registered` };
}

/** The first non-empty line of `text`, at most 200 characters. */
export function firstLine(text: string): string {
  const line = text.split(/\r?\n/).find((entry) => entry.trim() !== "") ?? "";
  return line.trim().slice(0, 200);
}
