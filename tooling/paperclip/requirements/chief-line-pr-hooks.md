# paperclip.chief-line-pr-hooks

- Status: active
- Since: unreleased
- Source: HAL-18586 (update 14:13 UTC, ci-fasttrack with the board): GitHub webhooks are the main path for tracked pull requests' outcomes, the PR watcher's pass stays as the safety net

While the chief line and its pull request outcomes (`chiefLine.prOutcomes`) are on, when a signed-in board user (the pr-hooks receiver in `infra/pr-hooks`, which has already checked GitHub's webhook signature) calls the Agent tools plugin's `POST /chief-line/pr-event` with `{repo, pr, kind}` and either `comment` (a pull request comment's id, body, author association, creation time and link), `head` and `conclusion` (a completed `ci-ok` on the pull request's head), or `merged` (a closed pull request), the plugin shall, for every caller tracking that pull request on its chief line, post the event as one line on the caller's newest thread, under the same rules and with the same markers as the PR watcher's pass (`paperclip.chief-line-prs`), and signal the caller's webhook without waking Chief. It shall read nothing from GitHub, answer a pull request that its tracked pull request index (written by `track`, rewritten from the markers by every pass) names for no caller before any Paperclip read, post nothing for a pull request no caller tracks or an event a marker shows was already posted, and never post one event twice when the pass and a delivery meet: both run one at a time per caller. It shall answer 400 for a malformed event, 409 while pull request outcomes are off, and refuse an agent's key like every chief line route.

## Examples

- Given ci-fasttrack tracks #6089,
  when Liam's signed "changes requested" arrives by webhook, then the PR watcher passes,
  then one line is posted, ci-fasttrack is signalled, Chief isn't woken, and the pass posts nothing.
- Given the same delivery arrives twice,
  when the plugin handles the second,
  then it posts nothing.
- Given a merge of #6089 arrives by webhook,
  when the pass then sees #6089 merged,
  then "merged; no longer tracked." is posted once.
- Given nobody tracks #6085,
  when a `ci-ok` for #6085 arrives,
  then the plugin answers `{posted: 0}` without reading any Paperclip task or comment.
- Given a reinstall cleared the index while ci-fasttrack tracks #6089,
  when the PR watcher passes,
  then the index again names ci-fasttrack for #6089.
- Given `chiefLine.prOutcomes` is off,
  when an event arrives,
  then the plugin answers 409 and posts nothing.
