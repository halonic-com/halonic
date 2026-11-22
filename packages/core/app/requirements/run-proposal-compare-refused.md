# app.run-proposal-compare-refused

- Status: active
- Since: unreleased
- Source: HAL-15764 (Nina's C623 run, row #4752: `halonic proposals show` stopped on a file in the profile folder)

When the person compares a file of a run's proposal that Accept would refuse (`app.run-proposal-trust`), the proposal service shall give the run's base and the run's text, no saved file, and why Accept would refuse it in `refused` (`under-git`, `under-halonic` or `outside-workspace`), instead of failing. It shall not read a saved file whose path is inside `.git/` or `.halonic/` or one the assistant may never write.

## Examples

- Given a store that refuses `notes/link/today.md`, such as a file in the profile folder, and run `01JD8Q` adds it,
  when the person compares that file,
  then Compare gives the run's text, no saved file, and `refused` as `outside-workspace`.
- Given run `01JD8Q` adds `.git/hooks/post-checkout`,
  when the person compares it,
  then Compare gives `refused` as `under-git` and no saved file.
