# paperclip.merge-control-hook-refused

- Status: active
- Since: unreleased
- Source: HAL-17925; the board, HAL-17891 item F, 25 Nov 00:53 and 01:25; the Merger's `pass.js` and `stats.js`

When a merge group would hold its pull request as the culprit and every failed job other than `ci-ok` has a failure annotation titled `halonic-ci refused this job`, the plugin shall not hold the pull request, comment, lift a flake hold or record main as broken, and shall count the group as cancelled and hook-refused rather than failed; a group with any other failed job, or with a failed job whose annotations weren't read, shall keep the culprit hold.

## Examples

- Given a failed group whose every failed job the runner hook refused,
  when a pass runs,
  then nothing is held or commented, the pull request goes back in, and the stats show `cancelled 1 (hook-refused 1)`.
- Given a refused job next to a real test failure, as in run 44965238706,
  when a pass runs,
  then the pull request is held as before.
- Given a failed job whose annotations couldn't be read,
  when a pass runs,
  then the pull request is held as before.
