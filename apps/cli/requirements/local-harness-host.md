# cli.local-harness-host

- Status: active
- Since: unreleased
- Source: HAL-7747 (scope decided on HAL-6476, option 1); tests from Liam on HAL-6290 and HAL-7039; the instruction trust check from HAL-3106 slice 3d (HAL-10512)

The CLI's local engine shall build its harness host from this computer's parts behind one builder, `openLocalHarnessHost`, which calls `harnessHostOf` of `@halonicjs/host-harness-host`, and shall pass its `harnesses` and `proposalFolders` to the engine. The parts are the srt sandbox for agents that run in the sandbox, the launcher for agents the person set to "On this computer", Claude Code and Codex, the Node bridge server, the harness profile builder on the workspace's folders in the profile, git with its worktrees in the workspace's folder in the profile, and the agents' files as the run's version has them: for `halonic routines watch` the version each run reads, and otherwise as they are on disk. The run's instructions (the agent's `instructions` and selected skills, from the run's version when runs start from versions, else as on disk) shall be copied read-only into a folder inside the harness temp root and pinned for the run log, so an engine that stopped leaves nothing after the next open. A harness run shall start only when a person trusted its instructions as they are: the host shall give the engine an `InstructionTrustService` over the trusted pins in the `instruction-trust` folder of the profile, keyed by the workspace's real path and the agent, so a run whose instructions changed since, or that nobody trusted, is refused before the program starts. The folder is in the profile, which the sandbox profile denies, and never in the workspace. The harness shall be given the text of the agent's `instructions` that was pinned, not a second read of the file. A harness program shall get only the variables on a fixed list of names (`PATH`, the locale, `TZ` and the Windows system variables) plus its run's own, built from that list and never from the CLI's environment minus some entries, so a variable the list doesn't know, such as a token, never reaches it, in the sandbox or on this computer (HAL-5397, N9). The bridge shall be given no secrets, since every agent signs in with its own program. Nothing shall start until a harness run needs it: git starts at the first worktree, and the engine shall not start it at open when the profile holds no proposal and no worktree. Each top-level run that can write files shall write them in a proposal folder, a worktree at the run's version, and never in the workspace or in the copy its connectors' programs start in. When the run ends, the engine shall take the proposal before the worktree is released; a run that writes no files shall end with no proposal. A run in a workspace with no history shall write in a plain copy of the saved files in the workspace's folder in the profile, and its proposal shall keep what it changed there; Accept's trash is a folder of the same profile, never the workspace. A harness run the next engine finds interrupted shall end as `failed` with the reason `interrupted`, keeping its proposal. The sandbox profile of a harness run shall deny the profile folder as a whole, and open only the run's own folders in it. An error in clearing what a harness run left shall be shown only in a `--debug` line. `halonic run` shall still refuse an agent that runs in a harness until HAL-6477 turns them on.

## Examples

- Given a workspace in git and a run whose coder agent writes `files/agents/coder/change.txt`,
  when the run ends,
  then the proposal names that file, the worktree is gone, and the file was never in the workspace or in the copy its connector started in.
- Given a harness run that writes nothing,
  when it ends,
  then it completes with no proposal, and its worktree is gone.
- Given a workspace with no git history,
  when a run with a harness agent starts,
  then it is refused with an error that says to run `git init` and commit.
- Given a harness agent whose instructions changed after a person trusted them,
  when its run starts,
  then the run fails naming `AGENTS.md`, and the program never starts.
- Given a harness agent whose instructions nobody trusted,
  when its run starts,
  then the run fails and the program never starts.
- Given a harness run that was going when the engine stopped,
  when the next engine starts its first run,
  then the old run is `failed` with the reason `interrupted`, and its proposal is kept.
- Given a harness run,
  when its sandbox profile is built,
  then the profile folder is denied, and only the run's worktree, temp and settings folders are writable in it.
- Given a CLI whose environment holds `PATH` and a token variable the list doesn't know,
  when a harness program is started on this computer,
  then the program sees `PATH` and its run's own variables and not the token.
