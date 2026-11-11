# cli.commands.trust.review-and-trust

- Status: active
- Since: 0.1.0
- Source: HAL-188 build plan, stack 4c and 4d (items 9, 10a, 10b and 10c); the approved CLI output on HAL-1981 (sections 1.7 and 3.5 at revision 40); `--yes` and the second question from HAL-2134 and HAL-2618; refused files from HAL-5421

The `halonic trust [--dir <folder>]` command shall show the trust check of the workspace in the folder and, when it isn't trusted on this computer yet, ask "Trust Acme on this computer? [y/N]", and for a program that isn't pinned a second question, and shall save the trust only when every answer is yes. When the workspace is already trusted and nothing changed, it shall print the ✓ "already trusted" line and ask nothing. `--yes` shall answer every question only together with `--fingerprint` that is the current full fingerprint; `--yes` alone shall be wrong usage (exit 2), and a fingerprint that isn't the current one shall save nothing, ask nothing and exit 3. When nobody can answer (no terminal, `CI` or `--json`) and `--yes --fingerprint` weren't given, it shall save nothing, print the check to stderr, the reason and the flags that answer in F16's two lines, and the bare full fingerprint as the last stdout line, and exit 3. An answer of No shall save nothing and exit 3. `--list` shall print one line per trusted workspace with its name, folder and the day it was trusted, and its `--json` shall add the fingerprint. `--remove` shall forget the trust in the workspace, also when its folder is gone. When the check refuses something, such as a connector whose URL has user info, `halonic trust` and every command that needs trust, such as `halonic run`, shall save nothing, ask nothing and exit 2, naming each refused file, workspace-relative, and why, and never its address.

## Examples

- Given Acme, not trusted yet, with one connector that starts `npx`,
  when `halonic trust --dir acme` runs in a terminal and the user answers `y` twice,
  then it shows the check with the `!` not-pinned line and the full fingerprint, asks both questions, prints "✓ Acme can run now." and exits with 0.
- Given the same Acme and no terminal,
  when `halonic trust --dir acme` runs,
  then stderr has the check and "✕ Acme isn't trusted on this computer yet, and there's no terminal to ask you.", the last stdout line matches `^hfp1:[0-9a-f]{64}$`, nothing is saved and it exits with 3.
- Given that fingerprint,
  when `halonic trust --dir acme --yes --fingerprint <fingerprint>` runs,
  then it asks nothing, prints "✓ Acme can run now." and exits with 0; run again, it prints "✓ Acme is already trusted on this computer. Nothing changed since 3 Nov.".
- Given a fingerprint from before a connector was added,
  when `halonic trust --dir acme --yes --fingerprint <old>` runs,
  then it prints "✕ Couldn't trust Acme: it changed since that fingerprint was made.", saves nothing and exits with 3.
- Given Acme with a connector file `library/connectors/mail.connector.yaml` whose URL is `https://ops:pw@mail.example.com/mcp`,
  when `halonic trust --dir acme` runs,
  then it exits 2 with "✕ Couldn't trust Acme: library/connectors/mail.connector.yaml can't be trusted, because the URL has user info.", nothing is saved, and neither the output nor its `--json` holds the password.
