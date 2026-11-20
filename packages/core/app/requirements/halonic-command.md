# app.halonic-command

- Status: active
- Since: unreleased
- Source: HAL-12725 (first-run check F7, L1, D1 on HAL-12721; D-A on HAL-12822; D-A2 on HAL-12847)

When Studio shows a `halonic` command to copy, the command shall name the workspace with `--dir` and the folder's absolute path right after the command's words, so it works from a new terminal. The folder and each argument shall be one shell word each, as `std.shell-word` writes it. Because the CLI runs on Windows only in WSL 2, a folder with a drive letter shall be written as WSL names it (`/mnt/` and the drive letter in lower case, then the rest with forward slashes), and a folder on a network share shall get no command. Where the app gives no folder, the command shall name none. The command that starts a run, `halonic run`, shall not be given at all for a Windows folder (a drive path or a network share): a run started in WSL 2 lands in the Linux profile, where Studio, which lists the runs of the Windows profile, never shows it.

## Examples

- Given the folder `/acme/Documents/Acme sample`, then answering run 6ab5ad reads `halonic runs send --dir "/acme/Documents/Acme sample" 6ab5ad approve`.
- Given the folder `Acme sample` in `Acme` on drive D, then testing `reply` reads `halonic test --dir "/mnt/<drive>/Acme/Acme sample" --filter reply`, with `d` for `<drive>`.
- Given the folder `\\acme\Acme sample`, then there is no command.
- Given the folder `Acme sample` in `Acme` on drive D, then there is no command to run `reply`.
- Given the folder `/acme/shared/acme`, then running `support/reply` reads `halonic run --dir /acme/shared/acme support/reply`.
- Given no folder, then running `reply` reads `halonic run reply`.
