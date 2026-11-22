# cli.commands.runs.list-address-question

- Status: active
- Since: unreleased
- Source: HAL-16321 (C696 finding 2 on HAL-16316: `halonic runs` listed a run whose model call waits for the answer to Studio's "Allow this address?" as "Waiting for your answer in the step <step>", without the dialog or Studio, so a CLI user had no hint where to answer; team wording under HAL-2282)

When a running run's model call waits for the answer to Studio's "Allow this address?" (an open `key-origin.asked`, requirement `events.summary-key-origin-asked`), `halonic runs` shall list it as "! Needs you" with the What "Waiting for your answer in Studio: "Allow this address?" in the step <step>", in the words `halonic runs show` uses for it (`cli.commands.runs.show-address-question`). It shall never offer `halonic runs send` for it. Once the question is answered, the run shall be listed as running again.

## Examples

- Given a running run of Support reply whose step Draft a reply asked whether provider `gateway` may send key `gateway-key` to `https://gw.example`,
  when `halonic runs` is run,
  then its row reads "! Needs you", "Support reply" and "Waiting for your answer in Studio: "Allow this address?" in the step Draft a reply", and exits 0.
- Given the same run after the question was answered `allowed`,
  when `halonic runs` is run,
  then its row reads "In Draft a reply".
