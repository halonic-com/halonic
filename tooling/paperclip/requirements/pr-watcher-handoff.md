# paperclip.pr-watcher-handoff

- Status: active
- Since: unreleased
- Source: HAL-17675; the board's decision on HAL-10 (24 Nov) to hand a ready, green pull request to its reviewer without waiting for the author; the reviewer split of HAL-14809

When the PR watcher checks an open task whose author holds it and has no run going, and every open pull request of the task is out of draft, mergeable, without an open review finding, and either has a green `ci-ok` on its head or is approved on it, and at least one is not approved on its head, the PR watcher shall comment once per head ("PR watcher: ready for review: #N, head `abc1234`."), give the task to its reviewer with status `todo` and wake them: Julian when the path rules (`reviewerFor`) say Julian for every such pull request, otherwise Liam; Julian for a pull request Liam wrote, and Liam for one Julian wrote. It shall leave the task with its author when the task has an open child task, or when the author's newest comment on the task has the line `PR watcher: own review task` (a security or release pull request, which has a review task of its own). The host adapter shall refuse any handoff other than to one agent with status `todo`.

## Examples

- Given pull request 5701 on `mateo/HAL-5701-work`, out of draft, green and mergeable, with Mateo holding the task and no run going,
  when the watcher runs twice,
  then it comments "PR watcher: ready for review: #5701, head `5701aaa`." once and gives the task to Julian once.
- Given the same pull request and the path rules saying Liam,
  when the watcher runs,
  then it gives the task to Liam.
- Given a pull request on a `liam/` branch,
  when the watcher runs,
  then it gives the task to Julian; one on a `julian/` branch goes to Liam.
- Given a pull request that is a draft, has a pending or failed `ci-ok`, conflicts, needs reopening after a base change, has an open review finding, or is approved on its head,
  when the watcher runs,
  then it leaves the task with its author.
- Given a task with a second pull request that is still a draft,
  when the watcher runs,
  then it leaves the task with its author.
- Given a task its author is running on, one with an open child task, or one its reviewer holds,
  when the watcher runs,
  then it leaves the task where it is.
- Given the author's newest comment ends with the line `PR watcher: own review task`,
  when the watcher runs,
  then it leaves the task with its author and reads no changed files.
- Given the reviewer gave the task back without a new push,
  when the watcher runs,
  then it doesn't hand it over again; after a push to a new head it does.
- Given the author handed the task on, closed it or started a run on it while the pass ran,
  when the host adapter is asked to hand it to the reviewer,
  then it writes nothing.
