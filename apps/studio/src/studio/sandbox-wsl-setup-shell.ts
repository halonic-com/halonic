import { parse, type Schema, s } from "@halonicjs/schema-kit";
import type { TauriIpc } from "@halonicjs/studio-services";

/**
 * How the shell's WSL setup ended (`sandbox_wsl_setup`, HAL-16765): done, with the host started in
 * the new distro; Windows must restart; the administrator prompt turned down; failed, with a reason
 * code of the sandbox port's list, the setup's own code when it gave one, and what it said for the
 * log; the 5-minute limit reached (the setup is left to finish); an earlier setup still running; no
 * image beside the app; the host beside the app didn't start; or it ended without saying how.
 */
export type ShellWslSetup =
  | { readonly outcome: "done" }
  | { readonly outcome: "restart_needed" }
  | { readonly outcome: "cancelled" }
  | {
      readonly outcome: "failed";
      readonly reason: string;
      readonly code?: string;
      readonly details: string;
    }
  | { readonly outcome: "timed_out" }
  | { readonly outcome: "still_running" }
  | { readonly outcome: "image_missing" }
  | { readonly outcome: "not_started"; readonly details: string }
  | { readonly outcome: "unanswered"; readonly exitCode?: number };

/** Runs the WSL setup through the shell. The page names nothing: the shell picks every argument. */
export type WslSetupHelper = () => Promise<ShellWslSetup>;

const wslSetupSchema = s.discriminatedUnion("outcome", [
  s.object({ outcome: s.literal("done") }).strict(),
  s.object({ outcome: s.literal("restart_needed") }).strict(),
  s.object({ outcome: s.literal("cancelled") }).strict(),
  s
    .object({
      outcome: s.literal("failed"),
      reason: s.string(),
      code: s.string().optional(),
      details: s.string(),
    })
    .strict(),
  s.object({ outcome: s.literal("timed_out") }).strict(),
  s.object({ outcome: s.literal("still_running") }).strict(),
  s.object({ outcome: s.literal("image_missing") }).strict(),
  s.object({ outcome: s.literal("not_started"), details: s.string() }).strict(),
  s.object({ outcome: s.literal("unanswered"), exitCode: s.number().int().optional() }).strict(),
]) as Schema<ShellWslSetup>; // `as`: an optional key reads as `| undefined` to the compiler.

/**
 * The shell's WSL setup, where the shell offers it: on Windows, with the agent host in Halonic's
 * WSL distro, as with no saved choice or `srt-wsl`. The shell answers `sandbox_wsl_setup_offered`
 * for exactly that. `undefined` otherwise, also where the shell doesn't grant the command.
 */
export async function wslSetupOf(ipc: TauriIpc): Promise<WslSetupHelper | undefined> {
  const offered = await ipc.invoke("sandbox_wsl_setup_offered").catch(() => false);
  if (offered !== true) return undefined;
  return async () => {
    const answer = parse(wslSetupSchema, await ipc.invoke("sandbox_wsl_setup"));
    if (!answer.ok) throw new Error("The shell gave an answer Studio can't read.");
    return answer.value;
  };
}
