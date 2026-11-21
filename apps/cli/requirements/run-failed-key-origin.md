# cli.run-failed-key-origin

- Status: active
- Since: unreleased
- Source: HAL-15330 (from C558 on HAL-15310; the words follow the models refusal and the UX checklist on HAL-11873, a team decision under HAL-2282)

When a run's log ends with `run.failed` whose cause is `models.key-origin-not-allowed` with the provider, the key's name and the address, `halonic run` and `halonic runs show` shall print line 1 "<workflow> failed in the step <step>: provider <provider> can't send key <key> to <address>, because that address isn't allowed for this key." and line 2 "Only if you recognise that address, allow it with halonic models allow-address <key> <address>, then run again.", with the key and the address as shell words and no `--dir`, because the allowed addresses are kept per key on this computer. Neither line shall say Halonic can't tell the cause, or ask for a report. The words shall say "address" and "key", never "origin", "host" or "URL".

## Examples

- Given a run that fails in the step Draft a reply of Support reply with the cause `models.key-origin-not-allowed` for the provider `gateway`, the key `fake-key` and the address `https://other.example.com`,
  when its failure lines are worked out with `--dir ./acme`,
  then line 1 ends "provider gateway can't send key fake-key to https://other.example.com, because that address isn't allowed for this key." and line 2 is "Only if you recognise that address, allow it with halonic models allow-address fake-key https://other.example.com, then run again."
