import type { SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import type { HostIo } from "../host.ts";
import { copySandboxSetting, removeSandboxSettingCopy } from "./setting-copy.ts";

/** Runs the `--sandbox-*` command in the arguments, or returns `undefined` when there is none. */
export function sandboxCommand(
  args: readonly string[],
  profileFolder: string | undefined,
  io: Pick<HostIo, "input" | "write">,
  sandbox: () => SrtSandbox,
): Promise<number> | undefined {
  if (args.includes("--sandbox-check"))
    return sandbox()
      .check()
      .then((result) => answer(io, result));
  if (args.includes("--sandbox-setup"))
    return sandbox()
      .setUp()
      .then((result) => answer(io, result));
  if (args.includes("--sandbox-remove"))
    return sandbox()
      .remove()
      .then((result) => answer(io, result));
  const profileCommand = profileCommandOf(args);
  if (profileCommand === undefined) return undefined;
  if (profileFolder === undefined) {
    const missing = { ok: false, reason: `${profileCommand} needs --profile-folder.` };
    return Promise.resolve(answer(io, missing));
  }
  return runProfileCommand(profileCommand, profileFolder, io, sandbox).then((done) =>
    answer(io, done),
  );
}

function runProfileCommand(
  command: (typeof profileCommands)[number],
  profileFolder: string,
  io: Pick<HostIo, "input">,
  sandbox: () => SrtSandbox,
): Promise<{ ok: boolean }> {
  switch (command) {
    case "--sandbox-cleanup":
      return sandbox().cleanUp(profileFolder);
    case "--sandbox-setting-copy":
      return copySandboxSetting(io.input, profileFolder);
    case "--sandbox-setting-remove":
      return removeSandboxSettingCopy(profileFolder);
  }
}

/** The one-shot commands that work on the profile folder. */
const profileCommands = [
  "--sandbox-cleanup",
  "--sandbox-setting-copy",
  "--sandbox-setting-remove",
] as const;

function profileCommandOf(args: readonly string[]): (typeof profileCommands)[number] | undefined {
  return profileCommands.find((command) => args.includes(command));
}

/** Prints `result` as one JSON line. @returns its exit code: 0 when it is `ok`, 1 when not */
function answer(io: Pick<HostIo, "write">, result: { ok: boolean }): number {
  io.write(`${JSON.stringify(result)}\n`);
  return result.ok ? 0 : 1;
}
