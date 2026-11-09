# format.agent-sandbox-fields

- Status: active
- Since: 0.1.0
- Source: stack 2a of the [HAL-189 implementation plan](/HAL/issues/HAL-189#document-implementation-plan), with Liam's changes from HAL-1967; Julian's site cap from HAL-1708; task HAL-189

When `parseFile` reads an agent file, the format shall accept three optional fields that say how a harness agent runs, and leave each out when the file does, so older files read as before:

- `harness`: `halonic`, `claude-code` or `codex`. Any other value fails.
- `workingFolder`: a path relative to the workspace, with `/` between its parts. It fails when it is absolute, has a drive, a `\`, or a `.`, `..` or empty part, or starts in `.git`, `.halonic`, `hubs` or the folder of any file kind. `defaultWorkingFolder(id)` gives `files/agents/<id>` for a file that leaves it out.
- `allowedSites`: at most 50 entries, each a host name with at least two labels, or `*.` and a domain with at least two labels. An entry fails when it is a bare `*`, has a wildcard anywhere else, is an address, has a scheme, port, path or user part, is a `localhost` name, or isn't a valid host name. Entries may be in any case and in Unicode; `asciiAllowedSites(sites)` gives them lowercase, in Punycode and each once, which is the form the sandbox and the trust prompt use.

## Examples

- Given an agent with only an id and a name, when it is parsed, then it has no `harness`, `workingFolder` or `allowedSites`.
- Given `harness: claude`, when it is parsed, then it fails with `invalid_value` at `harness`.
- Given 51 allowed sites, when it is parsed, then it fails with `too_big` at `allowedSites`.
- Given `workingFolder: ../outside`, `.git/hooks`, `agents` or `hubs/billing/files`, when it is checked, then it fails.
- Given the folder of any file kind, when the protected folders are listed, then its first part is among them.
- Given `*`, `*.com`, `10.0.0.1`, `[::1]`, `localhost`, `https://api.example.com` or `api.example.com:8443`, when it is checked as a site, then it fails.
- Given `API.Example.com`, `bücher.example` and `api.example.com`, when they are stored, then they are `api.example.com` and `xn--bcher-kva.example`.
