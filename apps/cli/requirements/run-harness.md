# cli.run-harness

- Status: active
- Since: unreleased
- Source: plan v1.17 (`halonic run --harness`); 6b of the HAL-189 implementation plan, amended by Liam on HAL-3789; the sandbox before the trust check from HAL-6580; harness programs run since HAL-6477 (board yes on HAL-9332)

When `halonic run <workflow>` is given `--harness <harness>`, the command shall run every agent of the run, and of the runs it starts, in that harness instead of the one its file names, and the run's `run.started` shall record it. Before the run starts, it shall refuse, with nothing run and nothing written to the run log:

1. a name that isn't a harness (`invalid_input`, exit 2), with the harnesses there are;
2. a harness program that `detect()` finds missing, too old, or can't ask its version (`unavailable`, exit 9). A program that is installed but signed out is allowed, because it can still run with a key Halonic holds;
3. a harness program on a workspace that isn't trusted as it is now (exit 3), even when the workspace only reaches the test model, because the program reaches more than that. Items 4 and 5 come before this check: a run that can't start has nothing to trust, so it shows no trust check and no fingerprint (HAL-6580);
4. a harness program that would move an agent from Halonic's own loop into a program while its file names `allowedSites` or a `workingFolder` (`invalid_input`, exit 2): the trust prompt and the working-folder check only read those for agents whose file names a harness, so no one was shown or checked them. `halonic runs send` refuses the same for a run that recorded such a harness, with "Nothing was sent.";
5. a run whose agents now need the sandbox when it can't start here, as `cli.run` says.

Once every check passes, the run starts with its agents in that harness, and what they change is kept as a proposal (`cli.run-proposal`).

`--harness halonic` runs every agent in Halonic's own loop. It starts no program, so it needs no sandbox, and no trust when the workspace only reaches the test model.

## Examples

- Given `--harness claude`, then the command exits 2 with "there's no harness called claude. Nothing ran." and no run starts.
- Given `--harness codex` and Codex isn't installed, then it exits 9 with "Codex isn't installed on this computer. Nothing ran." and the sandbox isn't checked.
- Given `--harness claude-code`, Acme not trusted and a sandbox that starts, then the sandbox is checked once, and it shows the trust check and exits 3 with no run started.
- Given `--harness codex`, Acme not trusted and a sandbox that can't start in a container, then it exits 9 saying the sandbox can't start, and shows no trust check and no fingerprint.
- Given Acme trusted, `--harness claude-code` and a sandbox that can't start, then it exits 9.
- Given Writer, in Halonic's own loop, with `workingFolder: tools`, Acme trusted and `--harness claude-code`, then it exits 2 naming Writer, and the sandbox isn't checked.
- Given `--harness halonic` and a sandbox that can't start, then the run starts, waits for the reply's approval, and its `run.started` has the harness `halonic`.
