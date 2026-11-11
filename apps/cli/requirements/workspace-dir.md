# cli.workspace-dir

- Status: active
- Since: 0.1.0
- Source: HAL-2754, for HAL-1892 and HAL-2742; the CLI output design on HAL-1981 (cli-output section 3, "Which folder", and the "Not a workspace" rows of 3.2 and 3.4), approved by the board on HAL-2123

The `halonic` commands that read a workspace shall work in the current folder, or in the folder given with `--dir <folder>`, resolved from the current folder. It shall never look for a workspace in a parent folder. When that folder has no `workspace.yaml`, or doesn't exist, the command shall stop with a `not_found` error (exit 4, code `no-workspace`) whose reason is "there's no workspace.yaml here." and whose fix is "Run it inside a workspace, create one with halonic init, or copy the example with halonic init --example acme.". When the folder itself can't be read because the account may not read it (`EACCES`, or `EPERM` on Windows), the command shall stop with an `invalid_input` error (exit 2) whose reason is "the folder can't be read." and whose fix is "Check the folder's permissions.". When the folder reads but its `workspace.yaml` can't be read for the same reason, the command shall stop with an `invalid_input` error (exit 2) whose reason is "the workspace file workspace.yaml can't be read." and whose fix is "Check the file's permissions, or move it out of the workspace." (the loader's words, HAL-4511). Every message shall show the folder as the user would type it, such as `./acme`, and a sentence that names the workspace shall name it by its folder's own name, such as `acme`.

## Examples

- Given `--dir acme` in a folder that holds `acme/workspace.yaml`,
  when the command opens its workspace,
  then it reads the files of `acme` and shows the folder as `./acme`.
- Given no `--dir` in a workspace folder,
  when the command opens its workspace,
  then it reads the current folder and shows it as `.`.
- Given `--dir downloads` and no `workspace.yaml` there, or no such folder,
  when the command opens its workspace,
  then it stops with a `not_found` error, code `no-workspace`, which exits with 4.
- Given a folder below a workspace, with no `workspace.yaml` of its own,
  when the command runs there without `--dir`,
  then it stops as above rather than use the workspace above it.
- Given a workspace folder set to mode 000,
  when the command opens its workspace,
  then it stops with an `invalid_input` error, "the folder can't be read.", which exits with 2.
- Given a readable workspace folder whose `workspace.yaml` is set to mode 000,
  when the command opens its workspace,
  then it stops with an `invalid_input` error, "the workspace file workspace.yaml can't be read.", which exits with 2.
