# cli.commands.runs.send-payload

- Status: active
- Since: unreleased
- Source: HAL-16440 (the model-mix trials hand a waiting run data the eval harness collected, such as a diff, without a model writing it); wording decided by the team (HAL-2282), Liam

With `--payload <file or JSON>`, `halonic runs send <run-id> <event>` shall send the event with that JSON object as its payload, through the same `RunEvents.sendEvent` service (`app.run-send-payload`), so the waiting step writes it to the run's context, and otherwise behave as `cli.commands.runs.send` says. Text that starts with `{` or `[` shall be read as the JSON; anything else names a file, relative to the folder the command runs in, as `halonic run --input` reads it. A file that isn't there, is a folder or can't be read, text that isn't JSON, or JSON that isn't an object shall stop the command with the reason after "Couldn't send <event> to run <short id>:" and its fix, exit 2, before anything is checked or sent.

## Examples

- Given a run of Code request waiting at its step Collect the diff for `diff`, and a file `diff.json` holding `{"diff": "diff --git a/src/a.ts b/src/a.ts"}`,
  when `halonic runs send 01jd8q diff --payload diff.json` is run,
  then the run's context gets that object as `lastEvent`, it prints "✓ Sent diff to run 01jd8q. Code request goes on.", and exits 0.
- Given that run,
  when `halonic runs send 01jd8q diff --payload missing.json` is run,
  then it stops with "✕ Couldn't send diff to run 01jd8q: there's no file missing.json.", exit 2, and sends nothing.
- Given that run, and a file `list.json` holding `[1, 2]`,
  when `halonic runs send 01jd8q diff --payload list.json` is run,
  then it stops with "✕ Couldn't send diff to run 01jd8q: the payload must be a JSON object.", exit 2, and sends nothing.
