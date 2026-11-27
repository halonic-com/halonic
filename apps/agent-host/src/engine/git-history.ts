import { realpath } from "node:fs/promises";
import { join } from "node:path";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import type { OpenedHistory } from "@halonicjs/adapter-workspace-engine-node";

/**
 * The workspace's git history, read only, or `null` when the folder isn't a
 * repository: what the engine role's watched versions read, and what the
 * Paperclip hand-over's run gate reads too, so both see the same version.
 */
export async function openGitHistory(root: string): Promise<OpenedHistory | null> {
  const isRepository = await realpath(join(root, ".git")).then(
    () => true,
    () => false,
  );
  if (!isRepository) return null;
  const runner = await GitRunner.create();
  // The engine only reads the history, so it never commits as this author.
  const vcs = new GitVcs(root, { runner, author: { name: "Halonic", email: "halonic@localhost" } });
  return { vcs, close: () => runner.close() };
}
