# cli.run-harness

- Status: active
- Since: 0.1.0
- Source: plan v1.17 (`halonic run --harness`); 6b of the [HAL-189 implementation plan](/HAL/issues/HAL-189#document-implementation-plan), amended by Liam on HAL-3789

When `halonic run <workflow>` is given `--harness <harness>`, the command shall run every agent of the run, and of the runs it starts, in that harness instead of the one its file names, and the run's `run.started` shall record it. Before the run starts, it shall refuse, with nothing run and nothing written to the run log:

1. a name that isn't a harness (`invalid_input`, exit 2), with the harnesses there are;
2. a harness program that `detect()` finds missing, too old, or can't ask its version (`unavailable`, exit 9). A program that is installed but signed out is allowed, because it can still run with a key Halonic holds;
3. a harness program on a workspace that isn't trusted as it is now (exit 3), even when the workspace only reaches the test model, because the program reaches more than that;
4. a harness program that would move an agent from Halonic's own loop into a program while its file names `allowedSites` or a `workingFolder` (`invalid_input`, exit 2): the trust prompt and the working-folder check only read those for agents whose file names a harness, so no one was shown or checked them. `halonic runs send` refuses the same for a run that recorded such a harness, with "Nothing was sent.";
5. a run whose agents now need the sandbox when it can't start here, as `cli.run` says;
6. a harness program at all, once the checks above pass, as `cli.run-sandbox-gate` says, because the engine `halonic run` opens has no harness adapter yet (HAL-5219). The refusal names the harness given here.

`--harness halonic` runs every agent in Halonic's own loop. It starts no program, so it needs no sandbox, and no trust when the workspace only reaches the test model.

## Examples

- Given `--harness claude`, then the command exits 2 with "there's no harness called claude. Nothing ran." and no run starts.
- Given `--harness codex` and Codex isn't installed, then it exits 9 with "Codex isn't installed on this computer. Nothing ran." and the sandbox isn't checked.
- Given `--harness claude-code` and Acme isn't trusted, then it exits 3, although Acme only reaches the test model.
- Given Acme trusted, `--harness claude-code` and a sandbox that can't start, then it exits 9.
- Given Writer, in Halonic's own loop, with `workingFolder: tools`, Acme trusted and `--harness claude-code`, then it exits 2 naming Writer, and the sandbox isn't checked.
- Given Acme trusted, `--harness claude-code` and a sandbox that starts, then it exits 9 with "Halonic can't run agents in Claude Code yet, and Writer is in Claude Code. Nothing ran." and no run starts.
- Given `--harness halonic` and a sandbox that can't start, then the run starts, waits for the reply's approval, and its `run.started` has the harness `halonic`.
