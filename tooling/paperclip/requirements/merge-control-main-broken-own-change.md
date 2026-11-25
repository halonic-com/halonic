# paperclip.merge-control-main-broken-own-change

- Status: active
- Since: unreleased
- Source: HAL-18537; research sweep 3 (HAL-18425, 25 Nov): the shadow merger filed #6052's Leak guard (commit author) failure as main broken, froze its queue and enqueued #6052 14 times while the live Merger held it

When a failed merge-group job's failure annotation names, in place of a file, a part of the group's own change that the leak guard checks (`commit message`, `commit author`, `commit committer`, `pull request title`, `pull request body` or `pushed ref name`), the plugin shall count that failure as the group's own pull request's, hold its head (`paperclip.merge-control-culprit-hold`), and shall neither record main as broken nor start the main-red freeze, whatever `main`'s newest finished push run is.

## Examples

- Given #6052's merge group cancelled after its Leak guard job failed with one annotation on `commit author`, and `main`'s newest push run red,
  when a pass runs,
  then #6052's head is held and its author told once, main isn't recorded as broken, nothing is frozen, and the next pass enqueues the other approved pull requests but not #6052.
- Given the same failure on `commit message` or `pull request title`, with `main`'s newest push run green,
  when a pass runs,
  then the pull request is held and nothing is said about main.
- Given a Leak guard job naming only files the pull request doesn't touch,
  when a pass runs,
  then `paperclip.merge-control-main-broken` decides as before.
