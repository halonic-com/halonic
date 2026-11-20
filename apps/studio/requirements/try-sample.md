# studio.try-sample

- Status: active
- Since: unreleased
- Source: flow-first-run 2.2 and 2.3, first-run-flow 3.2 and 10.2 R2, ux-checklists-t14-t15 part 2; HAL-1308, HAL-10917, HAL-13429

The desktop app shall give the workspace window a sample host. **Open demo** shall make the first of `Acme sample`, `Acme sample 2`, … that the shell finds missing in Documents, copy the files of `examples/acme` into it with `copyWorkspace`, and, since Halonic wrote every file, save the person's trust in it. It shall never write into a folder that is there and shall not ask where. The app shall bundle the example's files when it is built, so the CLI, the docs and Studio keep one source, and a test shall fail when the bundle and the folder on disk differ. If Documents can't be found or written, then the host shall say where it was meant to go and why, and write nothing. If the copy fails after the folder was made, its files are removed again; the empty folder stays, and the next try goes to the next name. For a folder remembered as the sample, the app shall tell the window whether the `default` alias of its `models.yaml` names a provider of type `mock`, read again whenever `models.yaml` or a provider file changes; until the first read, and when the files can't be read, it says no.

## Examples

- Given Documents has no `Acme sample`, then the shell makes `Acme sample`, the example's files are copied in and trust is saved.
- Given `Acme sample` and `Acme sample 2` are there, then the copy goes in `Acme sample 3` and the others stay as they were.
- Given the shell refuses to make the folder, then the result is `cant` with the shell's reason and nothing is trusted.
- Given a file is added to `examples/acme` and not bundled, then the test fails.
- Given the sample's `default` alias names `mock`, whose file has `type: mock`, then the window hears it is on the test model; once `default` names `anthropic`, it hears it isn't.
