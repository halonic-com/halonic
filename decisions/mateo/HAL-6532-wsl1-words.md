# Decision: the CLI words `not-supported` as WSL 1, names the missing Linux tools, and `doctor` shows what failed for `other`

- Task: HAL-6532 (part 3 of HAL-6518)
- Approval: the words are the team's call on an approved screen (board, HAL-2282), decided by Sofia on HAL-6526 and in her first-run walk, HAL-6538 items 12 and 13; Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:HK7QenOfl/39/vt7yCbbxbBk3zeRqx51K3RRE4j3lgoASH6JYn65Z3YYyPBpXYKZB45N10h8wbXhEgK2dEtHDw==

## What changes

- `not-supported` gets WSL 1's words in `apps/cli/src/messages/sandbox.ts`. The CLI's sandbox
  (srt on Linux) gives that code only on WSL 1 (HAL-6518), where "update the operating system"
  isn't the fix: switching the distro to WSL 2 is. The fix names the distro from
  `WSL_DISTRO_NAME`: as it is when it has only letters, digits, `.`, `-` and `_`, in double
  quotes otherwise, and `<distro>` when it is unset, empty, or has a character PowerShell's double
  quotes don't keep as it is (`"`, `$`, a backtick) or a control or bidi character.
- `halonic doctor` shows the check's own sentence for `other` (and a code this version doesn't
  know), as "What failed:" and its first line, in place of "Halonic can't tell what the sandbox is
  missing.". The line has no colour codes or control characters, is cut at 200 characters with
  "…", and gets no full stop of its own. Without a sentence, the old reason stays. `run` and
  `runs send` are unchanged: the sentence shows there only with `--debug`.
- `linux-tools-missing` names only what's missing, in `doctor`'s reason and fix and in a refused
  run's line 2: "socat isn't installed, and the sandbox needs it.", the same for ripgrep, and
  "socat and ripgrep aren't installed, and the sandbox needs both.", with `apt install` listing
  only those. Since HAL-6518 the srt check says which ones are missing in its sentence ("ripgrep
  is not installed"), so the CLI reads the tool names from it, rather than adding a field to the
  `Sandbox` port for this. A sentence that names neither, or says "socat or ripgrep" (an older
  check, or a run log), keeps the old "socat or ripgrep" words. A refused run's line 2 takes the
  same words, with Sofia's run sentences changed only in the tool names.
- `More:` links each code's section of the sandbox page, the anchors agreed on HAL-6524 and
  added by website #191: `windows` to `#windows-preview`, `not-supported` to `#wsl1` (HAL-6538
  item 13), `user-namespaces-restricted` to `#user-namespaces` (in place of `#apparmor`, which the
  page keeps as an alias), `linux-tools-missing` to `#linux-tools` and `other` to `#other`, next to
  `#bubblewrap` and `#container`. The CLI words `not-supported` as WSL 1 everywhere, so its link
  follows the code. Codes without a section (and the CLI's own `windows-node-in-wsl`) still link
  the page, on docs.halonic.dev as HAL-6561 set.

## Tests and requirements this edits

- `apps/cli/src/messages/sandbox.test.ts`: the word-for-word lists for every code change
  `not-supported`'s line 2, reason and fix to the WSL 1 words. The lists still cover every code
  in the port's order; nothing is removed or skipped. New tests cover the distro's name, its
  quoting, the "What failed:" label, each missing-tools case and the `#wsl1` link. The
  `linux-tools-missing` row of the lists is unchanged: it is the words when the check doesn't
  say which tool.
- `apps/cli/src/output/doctor-report.test.ts`: the `More:` lines for WSL 1, `other`, `windows`
  and `linux-tools-missing` gain their sections. The links test now maps every code to its link, in place of #1948's list, whose
  `user-namespaces-restricted` entry moves from `#apparmor` to `#user-namespaces`.
- `cli.sandbox-gate`: "the words shall come from the code alone" gains the exception that the
  WSL 1 fix names the distro and the missing-tools rule, with two new examples; the WSL 1
  example's link gains `#wsl1`, and the rule lists the sections.
- `cli.doctor-report`: gains the "What failed:" rule for `other`, the WSL 1 fix and link and
  the missing-tools rule, with two new examples. The example from cli-output 3.7 is unchanged.

## Covers

- cli.sandbox-gate
- cli.doctor-report
- cli.messages
