# engine.sandbox-blocked

- Status: active
- Since: 0.1.0
- Source: HAL-189, stack 4e of its implementation plan (Liam's review on HAL-1967); the "named once with a count" log line of HAL-1708

While a harness runs in its sandbox session, the engine shall count each access the session reports it refused, per target: a file with its access, or a site with its port. It shall record a target's first refused access straight away, as `sandbox.blocked` with the step's state and agent and `count: 1`, and shall only count the repeats. Past the first 100 targets of a step (`maxBlockedTargetsPerStep`), it shall count the further ones together as `others`, recorded the same way. Once the session has closed, it shall record one more `sandbox.blocked` for each target refused more than once, with its total, in the order the targets were first refused, and the step shall end only once those are in the log. When the engine stops the call, it shall record no totals, because the run records nothing more.

## Examples

- Given a `writer` agent whose sandbox refuses a read of `<home>/.ssh/id_ed25519` three times and a connection to `api.example.com` on port 443 once,
  when the step ends,
  then the log has `sandbox.blocked` for the file with `count: 1`, for the site with `count: 1`, and for the file again with `count: 3`, and nothing more for the site.
- Given a sandbox that refuses 102 different files once each,
  when the step ends,
  then the log names the first 100 files, then `others` with `count: 1`, and then `others` with `count: 2`.
- Given a harness run the engine stops while its sandbox has refused one file twice,
  when the call has stopped,
  then the log has that file's first block and no total.
