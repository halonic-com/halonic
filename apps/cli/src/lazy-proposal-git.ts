// Git for the proposal folders, started when a run first needs a worktree
// (HAL-7747): an engine that runs no harness agent never needs git, and a
// git that failed to start is tried again by the next call, not held against
// every call after it.

import { GitRunner, type GitRunnerOptions, GitVcs } from "@halonicjs/adapter-git";
import type { ProposalVcs } from "@halonicjs/app";

/** What {@link lazyProposalGit} starts git with. */
export interface LazyProposalGitInput {
  /** The workspace folder's real path. */
  readonly location: string;
  /** The folder the worktrees go in, in the workspace's folder in the profile. */
  readonly worktrees: string;
  /** Which git; the one on the `PATH` by default. */
  readonly git?: GitRunnerOptions;
}

/** The git the proposal service calls, started at its first call. `close` stops it, if it started; call it once no call is going. */
export function lazyProposalGit(input: LazyProposalGitInput): {
  vcs: ProposalVcs;
  close(): Promise<void>;
} {
  let opened: Promise<{ vcs: GitVcs; runner: GitRunner }> | undefined;
  const open = async (): Promise<GitVcs> => {
    // A git that failed to start is tried again by the next call.
    opened ??= (async () => {
      const runner = await GitRunner.create(input.git ?? {});
      const vcs = new GitVcs(input.location, {
        runner,
        // Worktrees only check versions out; a run's changes are committed to a proposal ref, as this author.
        author: { name: "Halonic", email: "halonic@localhost" },
        worktrees: input.worktrees,
      });
      return { vcs, runner };
    })().catch((error: unknown) => {
      opened = undefined;
      throw error;
    });
    return (await opened).vcs;
  };
  return {
    vcs: {
      addWorktree: async (...args) => (await open()).addWorktree(...args),
      removeWorktree: async (...args) => (await open()).removeWorktree(...args),
      listWorktrees: async () => (await open()).listWorktrees(),
      diffBetween: async (...args) => (await open()).diffBetween(...args),
      readAt: async (...args) => (await open()).readAt(...args),
      commitWorktreeTo: async (...args) => (await open()).commitWorktreeTo(...args),
      readRef: async (...args) => (await open()).readRef(...args),
      deleteRef: async (...args) => (await open()).deleteRef(...args),
    },
    close: async () => {
      const started = await opened?.catch(() => undefined);
      await started?.runner.close();
    },
  };
}
