import { claudeCodeHarness } from "@halonicjs/adapter-harness-claude-code";
import { codexHarness } from "@halonicjs/adapter-harness-codex";
import { opencodeHarness } from "@halonicjs/adapter-harness-opencode";
import { createProgramProbe } from "@halonicjs/adapter-sandbox-host";
import { WSL_SHARED_FOLDERS } from "@halonicjs/adapter-sandbox-srt";
import { FileSecretStore } from "@halonicjs/adapter-secrets-file";
import type { Harness, SecretStore } from "@halonicjs/ports";
import { type ProfileFolder, secretsFile } from "@halonicjs/profile";
import { hostWslRemover, type WslRemover } from "./sandbox/wsl-remove-host.ts";
import type { HostKeychain } from "./secrets/host-keychain.ts";
import { openWorkspaceReporting } from "./server/opened-workspaces.ts";
import type { HostConnection } from "./stdio/frame-stream.ts";
import { ShellChannel } from "./stdio/shell-channel.ts";

// The small parts `host.ts` puts together, kept here so that file stays short.

/** Removes the WSL setup; not served without a profile, nor inside the distro, which has no `wsl.exe`. */
export function wslRemoverOf(
  profileFolder: string | undefined,
  sharedFolders: readonly string[],
): WslRemover | undefined {
  if (profileFolder === undefined || sharedFolders.length > 0) return undefined;
  return hostWslRemover(profileFolder);
}

/** The folders every session denies: the WSL distro's shared ones when the launcher says the host runs there. */
export function sharedFoldersOf(args: readonly string[]): readonly string[] {
  return args.includes("--wsl-shared-folders") ? WSL_SHARED_FOLDERS : [];
}

/** The value after `name` in `args`, when there is one. */
export function argumentAfter(args: readonly string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
}

/** Where the host's own secrets are kept: the keychain when Studio answers for them, the profile's secrets file otherwise. */
export function hostSecretsOf(
  keychain: HostKeychain | undefined,
  profile: ProfileFolder,
): SecretStore {
  return keychain?.secrets ?? new FileSecretStore(secretsFile(profile));
}

/** Writes `text` to standard error, for a person to read. */
export function logToError(text: string): void {
  process.stderr.write(text);
}

/** The harnesses the host runs: Claude Code, Codex and OpenCode, found with this computer's launcher. */
export function hostHarnesses(version: string): Harness[] {
  const probe = createProgramProbe();
  return [
    claudeCodeHarness({ probe }),
    codexHarness({ probe, halonicVersion: version }),
    opencodeHarness({ probe }),
  ];
}

/**
 * The host's connection id 0 when Studio's shell answers for its secrets
 * (`--keychain-relay`): the secrets channel, and the shell's notices of
 * folders the person opened, which join `workspaceRoots` (requirement
 * `agent-host.opened-workspaces`). `undefined` without the shell.
 */
export function shellChannelOf(
  keychain: HostKeychain | undefined,
  workspaceRoots: string[],
  profileFolder: string | undefined,
  log: (text: string) => void,
): HostConnection | undefined {
  if (keychain === undefined) return undefined;
  return new ShellChannel(keychain.channel, (folder) => {
    openWorkspaceReporting(workspaceRoots, folder, profileFolder, log);
  });
}
