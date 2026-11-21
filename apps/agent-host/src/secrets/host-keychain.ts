import { FileSecretStore } from "@halonicjs/adapter-secrets-file";
import { type ProfileFolder, secretsFile } from "@halonicjs/profile";
import { KeychainHostSecrets } from "./keychain-host-secrets.ts";
import { ShellKeychainSecretStore } from "./shell-keychain-secret-store.ts";
import { ShellSecretsChannel } from "./shell-secrets-channel.ts";

/** The host's own secrets in the OS keychain, and the channel to Studio's shell they travel on. */
export interface HostKeychain {
  /** The host's end of connection id 0, which the serving mode carries. */
  channel: ShellSecretsChannel;
  /** What the host's own secrets are read from and saved to; the remote control's key comes from here. */
  secrets: KeychainHostSecrets;
}

/**
 * The host's own secrets in the OS keychain, when Studio started the host
 * with `--keychain-relay` (requirement `agent-host.keychain-secrets`): the
 * shell keeps them, and answers for them on connection id 0 after the
 * handshake. Started any other way (the CLI's `halonic serve`, a headless
 * Linux), the host has no keychain and keeps them in the profile's secrets
 * file, as before.
 *
 * @param log - where the move out of the secrets file says what it did
 */
export function hostKeychainOf(
  args: readonly string[],
  profile: ProfileFolder | undefined,
  log: (text: string) => void,
): HostKeychain | undefined {
  if (!args.includes("--keychain-relay")) return undefined;
  const channel = new ShellSecretsChannel();
  const file = profile === undefined ? undefined : new FileSecretStore(secretsFile(profile));
  const secrets = new KeychainHostSecrets(new ShellKeychainSecretStore(channel), file, log);
  return { channel, secrets };
}
