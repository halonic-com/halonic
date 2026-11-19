# cli.commands.tools.connector-start

- Status: active
- Since: unreleased
- Source: HAL-13670 (from Nina's C207 note on HAL-13667: a missing program read as "a problem it can't explain yet"); HAL-13731 (Nina's C220 check on HAL-13670: the same for a program that stops right after it starts); the words of Studio's connector failures (UX check C2, HAL-12410)

When the connector that `halonic tools review` or `halonic tools approve` starts to list its tools can't start because its program isn't on this computer, the command shall stop with line 1 "The program <program> isn't on this computer." and a fix that says to install it or change the command in the connector's file, named by its path, and exit 9 (`unavailable`). When its program stops by itself right after it started, before it answered, the command shall stop with line 1 "The program <program> stopped right after it started." and a fix that says to run the connector's command and args from its file, named by its path, to see why, and exit 9 (`unavailable`). When a secret the connector names isn't set, it shall stop with line 1 "The secret <name> isn't set on this computer." and a fix that says how to save it, and exit 2 (`invalid_input`). It shall tell the two apart by the error's type, never show the error's own text, and give `--json` the cause and the name as `reason` (`program-missing`, `program-stopped` or `secret-missing`) with `program` or `secret`.

## Examples

- Given `notes-mcp`'s command names `notes-nope`, which isn't on this computer,
  when `halonic tools review notes-mcp` runs,
  then it prints "✕ The program notes-nope isn't on this computer." and "Install notes-nope, or change the command in library/connectors/notes-mcp.connector.yaml." and exits 9.
- Given the same,
  when `halonic tools approve notes-mcp archive --json` runs,
  then the error has kind `unavailable`, `reason` `program-missing` and `program` `notes-nope`, and nothing is approved.
- Given `notes-mcp` names the secret `notes-token` in `secretEnv`, and it isn't set,
  when `halonic tools review notes-mcp` runs,
  then it prints "✕ The secret notes-token isn't set on this computer." and how to save it, exits 2, and no program starts.
- Given `notes-mcp`'s command names `notes-quits`, which exits as soon as it starts,
  when `halonic tools review notes-mcp` runs,
  then it prints "✕ The program notes-quits stopped right after it started." and "To see why, run the command and args from library/connectors/notes-mcp.connector.yaml yourself." and exits 9.
- Given the same,
  when `halonic tools approve notes-mcp archive --json` runs,
  then the error has kind `unavailable`, `reason` `program-stopped` and `program` `notes-quits`, and nothing is approved.
