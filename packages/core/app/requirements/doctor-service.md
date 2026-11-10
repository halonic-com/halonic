# app.doctor-service

- Status: active
- Since: 0.1.0
- Source: HAL-2270; cli-output 3.7 (the lines of `halonic doctor` and its exit code) and HAL-189 6a

When `halonic doctor` runs, the doctor service shall check the sandbox, the disk and the harnesses, and inside a workspace also the workspace's trust and its models, all at the same time, and return one line for each check that applies, with the summary and whether `doctor` exits 1. It shall read each provider's key from the secrets store only to learn whether it is stored, and it shall never call a provider over the internet. While `doctor` runs outside a workspace, there shall be no Workspace and Models lines, and no agent shall count as using a harness.

## Examples

- Given `doctor` runs outside a workspace on a machine with a working sandbox and plenty of disk,
  then it shows only the Sandbox and Disk lines, and exits 0.
- Given the workspace changed since it was trusted,
  then the Workspace line is ! and `doctor` still exits 0.
- Given `fast` uses Ollama, which answers with llama3.2 loaded, and `smart` uses Anthropic, whose key is stored,
  then the Models line is ✓ and lists both, and only Anthropic's secret was read.
- Given Ollama doesn't answer,
  then the Models line is ✕ and `doctor` exits 1.
- Given the agent Writer uses Codex, which isn't installed, and Planner runs in Halonic's own loop,
  then the Harnesses line is ! and names Writer only.
- Given the sandbox can't start and the disk has 0.8 GB free,
  then the summary counts one problem and one warning, and `doctor` exits 1.
