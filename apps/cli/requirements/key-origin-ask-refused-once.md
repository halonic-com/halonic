# cli.key-origin-ask-refused-once

- Status: active
- Since: unreleased
- Source: HAL-15213 (UX checklist on HAL-11873, "Same address asked again in a run": after a refusal in the same run, not asked again either)

When a person answered `not-allowed` to the question of `cli.key-origin-ask` in a run, a later refusal of the same key and address in that run shall fail with the refusal without asking again and without writing to the run's log. Another run, another key or another address shall be asked as before, and a call outside a run is never remembered.

## Examples

- Given the person didn't allow `https://gateway.example.com` for `fake-key` in run `run_1`,
  when a later call in `run_1` is refused for the same key and address,
  then it fails with the refusal, nobody is asked, and the log has nothing new.
- Given the same refusal in `run_2`, then the person is asked again.
- Given the person didn't allow `https://gateway.example.com` in a run,
  when a call in that run is refused for `https://eu.gateway.example.com`,
  then the person is asked about `https://eu.gateway.example.com`.
