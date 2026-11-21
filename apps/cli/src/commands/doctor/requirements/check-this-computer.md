# cli.commands.doctor.check-this-computer

- Status: active
- Since: 0.1.0
- Source: HAL-2270; the line set of HAL-2254 (item 3), in the layout of the approved CLI output on HAL-1981 (section 3.7, revisions 11, 20 and 24); exit codes settled by Liam on HAL-1984; a workspace with no model, from Nina's C340 check (HAL-14301, code row C22, wording decided by the team on the task)

The `halonic doctor [--dir <folder>]` command shall check this computer's sandbox, harnesses and disk, and, when the folder holds a workspace, the workspace's trust on this computer and the model servers and keys its aliases use, and shall print one line per check in the layout of cli-output 3.7. It shall ask each model server on this computer the workspace uses which models it has loaded, and shall never call a provider over the internet. It shall exit with 1 when a line is ✕, and with 0 otherwise, also when a line is !. Without `--dir`, a folder that holds no workspace shall be checked as the computer alone. If `--dir` names a folder that holds no workspace, then it shall say so and exit with 4. When the workspace's default model is an alias no file has, and the workspace has no model alias or an agent that names no model gets that default, the Models line shall be ✕ with "no model alias <alias> · copy models.yaml and providers/mock.yaml from Acme, or add your own", and the summary shall say "Agents without a model of their own won't run until <alias> is added." With `--json`, it shall write every check with its `check` and `status`, and the counts of problems and warnings.

## Examples

- Given a folder without a workspace, a sandbox that can start and 48 GB free,
  when `halonic doctor` runs in it,
  then it prints "✓ Sandbox ready · bubblewrap" and "✓ Disk 48 GB free · …", no Workspace or Models line, "No problems.", and exits with 0.
- Given the workspace Acme, not trusted yet, whose alias `fast` uses Ollama at localhost:11434 with llama3.2 loaded,
  when `halonic doctor --dir acme` runs,
  then it prints "! Workspace not trusted yet · halonic trust --dir acme" and "✓ Models Ollama answering at localhost:11434 · llama3.2 loaded (2.0 GB)", and exits with 0.
- Given the sandbox can't start inside a container,
  when `halonic doctor` runs,
  then the Sandbox line is ✕ with the container's reason and fix, and it exits with 1.
- Given the folder `nowhere` holds no workspace,
  when `halonic doctor --dir nowhere` runs,
  then it prints "✕ Couldn't check nowhere: there's no workspace.yaml here." and exits with 4.
- Given a workspace as plain `halonic init` writes it, with no models.yaml,
  when `halonic doctor` runs in it,
  then it prints "✕ Models no model alias default · copy models.yaml and providers/mock.yaml from Acme, or add your own" and "Agents without a model of their own won't run until default is added.", and exits with 1.
