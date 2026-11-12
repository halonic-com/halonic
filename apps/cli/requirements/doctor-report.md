# cli.doctor-report

- Status: active
- Since: 0.1.0
- Source: HAL-2270; cli-output 3.7 with the team's calls of revisions 20 and 24, microcopy L90–L94 (approved by the board on HAL-2123); the Harnesses line's placeholder words from P5 on HAL-2264; `other`'s "What failed:" line and the WSL 1 fix from Sofia on [HAL-6526](/HAL/issues/HAL-6526); the missing Linux tools by name and WSL 1's docs section from Sofia on [HAL-6538](/HAL/issues/HAL-6538) items 12 and 13

The `halonic doctor` command shall print its heading, an empty line, one line per check in the order Workspace, Models, Sandbox, Harnesses, Disk, then an empty line and the summary. Each check's line shall start with its mark (✓, ! or ✕) and its label in a column, and its other sentences shall be indented under its first word. A check the report leaves out shall print no line. A sandbox that can't start shall show its reason, its fix and `More:` with the docs link and the code under the line. For `other`, or a code this version doesn't know, the reason shall be "What failed:" and the check's own sentence when it gave one: its first line, trimmed, without colour codes or control characters, cut at 200 characters with "…", and with no full stop added (Sofia, HAL-6526). The fix for `not-supported` (WSL 1) shall name the distro `doctor` runs in. `More:` shall link the code's section of the sandbox page, as `cli.sandbox-gate` says. For `linux-tools-missing`, the reason and the `apt install` fix shall name only the tools the check's sentence names as missing, as `cli.sandbox-gate` says. The summary shall give the number of ✕ lines, or "No problems.", then what each ✕ line stops, Models before Sandbox, then the number of ! lines when there are any.

## Examples

- Given a trusted workspace, Ollama answering with llama3.2 loaded, an Anthropic key stored, a sandbox that can't start because bubblewrap is missing, and 48 GB free,
  when the report is printed,
  then the lines are those of cli-output 3.7's example, ending "1 problem. Agents set to run in a sandbox won't start until it's fixed.".
- Given a sandbox that can't start with `other`, and the check's sentence "bubblewrap can't start: bwrap: setting up uid map: Permission denied",
  when the report is printed,
  then the line under "can't start on this computer" is "What failed: bubblewrap can't start: bwrap: setting up uid map: Permission denied", with `other`'s fix under it.
- Given a sandbox that can't start with `linux-tools-missing`, and the check's sentence "socat is not installed",
  when the report is printed,
  then the lines are "socat isn't installed, and the sandbox needs it." and "Fix: install it, for example on Ubuntu or Debian with sudo apt install socat. Then run halonic doctor again.".
- Given the aliases smart and writer on Anthropic with no key stored,
  when the report is printed,
  then the Models line is "! Models smart and writer need an API key for Anthropic.".
- Given Ollama doesn't answer and Anthropic has no key,
  when the report is printed,
  then the Models line is ✕ with Ollama's line first and the no-key line under it, and the summary is "1 problem. Agents that use Ollama won't run until it answers.", because the line counts once.
- Given the agent Writer uses Codex, which isn't installed, and Claude Code 2.1.0 is ready,
  when the report is printed,
  then the Harnesses line is "! Harnesses Claude Code 2.1.0" with Writer's line and its fix under it.
- Given the free space can't be read,
  when the report is printed,
  then the Disk line is "! Disk free space unknown", followed by what Halonic uses when it is known, with the reason under it and no fix line.
