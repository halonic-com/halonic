# paperclip.snapshot-reviewer

- Status: active
- Since: unreleased
- Source: HAL-19653, the follow-up of HAL-19639 (`paperclip.reviewer-source`): the reviewer wake, the fast-track rules and the limit-aware reroute read only the GitHub snapshot and named Liam, or Julian on Liam's own, never Nora

When a `pr-watch` pass has taken a company's GitHub snapshot, the plugin shall name each open pull request's reviewer in it, as their signed line writes the name: for a pull request out of draft on the watcher's first repository, from a branch in that repository, the shared answer (`reviewerAnswer`, `paperclip.reviewer-source`), read from GitHub only when the head differs from the one kept for it in plugin state; for any other, or when that read fails, the author rule alone (Julian on Liam's own, Liam otherwise). The reviewer wake, the fast-track rules and the fast-track monitor shall take the reviewer from there, and a snapshot saved before it named one shall get the author rule's.

## Examples

- Given a routine pull request on `ravi/HAL-1-acme` the shared answer names `nora` for,
  when a pass runs,
  then the snapshot names `Nora` for it, and the reviewer wake wakes her.
- Given the same head kept from the previous pass,
  when the next pass runs,
  then it names `Nora` again and sends no GitHub request for it.
- Given a draft, a pull request from a fork, or one whose answer can't be read,
  when a pass runs,
  then it names `Liam`, or `Julian` on a `liam/` branch, and the pass doesn't fail.
