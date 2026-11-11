# format.agent-sandbox-fields

- Status: active
- Since: 0.1.0
- Source: stack 2a of the [HAL-189 implementation plan](/HAL/issues/HAL-189#document-implementation-plan), with Liam's changes from HAL-1967; Julian's site cap from HAL-1708; Liam's and Julian's review fixes from HAL-2228 and HAL-2221; Julian's re-review follow-ups from HAL-2430; `isInWorkingFolder` from HAL-4732; task HAL-189

When `parseFile` reads an agent file, the format shall accept three optional fields that say how a harness agent runs, and leave each out when the file does, so older files read as before:

- `harness`: `halonic`, `claude-code` or `codex`. Any other value fails.
- `workingFolder`: a path relative to the workspace, with `/` between its parts. It fails when it is absolute, has a drive, a `\`, a `:` anywhere, a control character or an invisible (default-ignorable) code point, a `.`, `..` or empty part, a part that ends in `.` or a space, or a part with `~` and a digit (an 8.3 short name). These checks apply to the path compared without regard to case or compatibility forms, so a fullwidth `．`, `／` or `：` fails like its plain form. It also fails when its first part, compared the same way, starts with `.` (such as `.git`, `.claude`, `.codex` or `.vscode`, where tools read hooks and tasks that would run outside the sandbox), or is `hubs`, the folder of any file kind or the file of a kind that lives in the workspace root (`workspace.yaml`, `models.yaml`, `deployments.yaml`, `hub.yaml`). `defaultWorkingFolder(id)` gives `files/agents/<id>` for a file that leaves it out. `isInWorkingFolder(path, folder)` tells whether a path relative to the workspace is the folder or inside it, compared as a file system that ignores case reads it, with `\` as `/`, `.` and `..` resolved and trailing dots and spaces dropped; an absolute path or one that leaves the workspace is never inside.
- `allowedSites`: at most 50 entries, each a host name with at least two labels, or `*.` and a domain with at least two labels. An entry fails when it is a bare `*`, has a wildcard anywhere else, is an address (its last label starts with a digit), has a scheme, port, path or user part, has fullwidth forms, an ideographic dot, a control character or an invisible code point, ends in `localhost`, `local`, `localdomain`, `internal` or `arpa`, or isn't a valid host name. Entries may be in any case and in Unicode; `asciiAllowedSites(sites)` gives them lowercase, in Punycode and each once, which is the form the sandbox and the trust prompt use.

## Examples

- Given an agent with only an id and a name, when it is parsed, then it has no `harness`, `workingFolder` or `allowedSites`.
- Given `harness: claude`, when it is parsed, then it fails with `invalid_value` at `harness`.
- Given 51 allowed sites, when it is parsed, then it fails with `too_big` at `allowedSites`.
- Given `workingFolder: ../outside`, `.git/hooks`, `agents` or `hubs/billing/files`, when it is checked, then it fails.
- Given `.GIT/hooks`, `Agents` or `HUBS/x`, when it is checked, then it fails.
- Given `agents./x`, `files/x:s`, `GIT~1/hooks` or a path with a zero-width code point, when it is checked, then it fails.
- Given `workspace.yaml` or `models.yaml`, when it is checked, then it fails.
- Given `.claude`, `.codex/x`, `.vscode` or `．claude`, when it is checked, then it fails; given `files/.notes`, it passes.
- Given `ａｇｅｎｔｓ．/x` or `agents／x`, when it is checked, then it fails like `agents./x` and `agents/x`.
- Given `Scripts\mail.sh` or `scripts. /mail.sh` and the folder `scripts`, when it is compared, then it is inside; given `scripts-old/mail.sh`, `/scripts/mail.sh` or `../scripts/mail.sh`, it isn't.
- Given the place of any file kind, when the protected names are listed, then its folder's first part, or its file name when the folder is the root, is among them.
- Given `*`, `*.com`, `10.0.0.1`, `127.0x1`, `[::1]`, `localhost`, `printer.local`, `https://api.example.com` or `api.example.com:8443`, when it is checked as a site, then it fails.
- Given a site in fullwidth characters or with an ideographic dot, when it is checked, then it fails.
- Given `API.Example.com`, `bücher.example` and `api.example.com`, when they are stored, then they are `api.example.com` and `xn--bcher-kva.example`.
