import { parse, type Schema, s } from "@halonicjs/schema-kit";
import type { TauriIpc } from "@halonicjs/studio-services";

/**
 * How the shell's start of the sandbox helper ended (`sandbox_elevate`, HAL-14841): the helper's
 * exit code, the administrator prompt turned down, the 5-minute limit reached (the helper is left
 * to finish), an earlier helper still running (Windows wasn't asked again), or Windows' reason it
 * didn't start.
 */
export type ShellElevation =
  | { readonly outcome: "exited"; readonly exitCode: number }
  | { readonly outcome: "cancelled" }
  | { readonly outcome: "timed_out" }
  | { readonly outcome: "still_running" }
  | { readonly outcome: "failed"; readonly reason: string };

/** Starts the sandbox helper's setup through the shell, with Windows' administrator prompt. */
export type ElevateSetup = () => Promise<ShellElevation>;

const elevationSchema = s.discriminatedUnion("outcome", [
  s.object({ outcome: s.literal("exited"), exitCode: s.number().int().min(0) }).strict(),
  s.object({ outcome: s.literal("cancelled") }).strict(),
  s.object({ outcome: s.literal("timed_out") }).strict(),
  s.object({ outcome: s.literal("still_running") }).strict(),
  s.object({ outcome: s.literal("failed"), reason: s.string() }).strict(),
]) satisfies Schema<ShellElevation>;

/**
 * The shell's start of the helper's setup, where the shell offers it: on Windows, with the agent
 * host beside the shell (the host in the WSL distro has no Windows setup). The shell answers
 * `wsl_removal_offered` for exactly that. `undefined` otherwise, and the host then runs the setup
 * itself, as before.
 */
export async function elevateSetupOf(ipc: TauriIpc): Promise<ElevateSetup | undefined> {
  const besideShell = await ipc.invoke("wsl_removal_offered").catch(() => false);
  if (besideShell !== true) return undefined;
  return async () => {
    const answer = parse(elevationSchema, await ipc.invoke("sandbox_elevate", { verb: "setup" }));
    if (!answer.ok) throw new Error("The shell gave an answer Studio can't read.");
    return answer.value;
  };
}
