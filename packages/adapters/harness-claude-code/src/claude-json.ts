import type { HostPaths, SettingsFolderWriter } from "@halonicjs/adapter-harness-kit/web";

/** Claude Code's own file in the settings folder, which holds its sign-in among much else. */
export const claudeJsonFile = ".claude.json";

/**
 * The keys of {@link claudeJsonFile} that the agent's sign-in needs, which
 * stay when the settings folder is reset:
 * - `oauthAccount`: the signed-in account;
 * - `primaryApiKey`: a Console key Claude Code stored at sign-in;
 * - `customApiKeyResponses`: which keys the user has accepted, so a key
 *   isn't asked about again;
 * - `userID`: the install's id, which the account's sign-in is tied to;
 * - `hasCompletedOnboarding`: without it Claude Code starts its first-run
 *   setup, sign-in included, again.
 */
export const claudeJsonSignInKeys: readonly string[] = [
  "oauthAccount",
  "primaryApiKey",
  "customApiKeyResponses",
  "userID",
  "hasCompletedOnboarding",
];

/**
 * Cuts {@link claudeJsonFile} in `folder` down to {@link claudeJsonSignInKeys}
 * (requirement `harness-claude-code.settings-reset-claude-json`). Everything
 * else goes, `projects` included: it holds a project's allowed tools, which
 * would let a later run's tool calls skip Halonic's approval. A file that
 * isn't a JSON object holds no sign-in Claude Code could read, so it goes
 * too. A file that already holds only those keys is left alone. The
 * rewritten file is the owner's alone, since it can hold a Console key.
 */
export async function keepClaudeJsonSignIn(
  paths: Pick<HostPaths, "join">,
  folder: string,
  writer: SettingsFolderWriter,
): Promise<void> {
  const path = paths.join(folder, claudeJsonFile);
  const text = await writer.read(path);
  if (text === null) return;
  const settings = parseObject(text);
  if (settings === null) {
    await writer.remove(path);
    return;
  }
  const keys = Object.keys(settings);
  if (keys.every((key) => claudeJsonSignInKeys.includes(key))) return;
  const signIn = Object.fromEntries(
    Object.entries(settings).filter(([key]) => claudeJsonSignInKeys.includes(key)),
  );
  await writer.write(path, `${JSON.stringify(signIn, null, 2)}\n`, { mode: ownerOnly });
}

/** Read and write for the owner only. */
const ownerOnly = 0o600;

function parseObject(text: string): Record<string, unknown> | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    // Claude Code can't read a broken file either; it counts as no sign-in.
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
