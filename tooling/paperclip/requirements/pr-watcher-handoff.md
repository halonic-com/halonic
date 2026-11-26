# paperclip.pr-watcher-handoff

- Status: active
- Since: unreleased
- Source: HAL-17675; Nora's routine reviews added on HAL-19283; the board's decision on HAL-10 (24 Nov) to hand a ready, green pull request to its reviewer without waiting for the author; the reviewer split of HAL-14809; the board's addition on HAL-10 (24 Nov 16:58 UTC) after Julian's refused approval on #5653 waited 70 minutes (HAL-17680); HAL-18190, the Merger's scope rule for Julian's rebase-only re-approval; HAL-18201, the rebase-only re-review on Liam's paths; HAL-18460, carried approvals and answered change requests; HAL-18459, Julian's rebase-only re-approval on any pull request

When the PR watcher checks an open task whose author holds it and has no run going, and every open pull request of the task is out of draft, mergeable, without an open review finding its author hasn't answered (`paperclip.pr-watcher-answered-review`), and either has a green `ci-ok` on its head or is approved on it (an approval the watcher recorded as carried over a rebase counts, `paperclip.pr-watcher-rebase-carry`), and at least one is not approved on its head, the PR watcher shall comment once per head ("PR watcher: ready for review: #N, head `abc1234`."), give the task to its reviewer with status `todo` and wake them: Nora when the path rules (`reviewerFor`) say Nora for every such pull request, Julian when they say Julian or Nora for every one, otherwise Liam; Julian for a pull request Liam wrote, and Liam for one Julian wrote. A pull request Liam approved on an older head and only rebased since, whose approval doesn't carry over, goes to Julian for a rebase-only re-approval, on any path `julianRebaseRefusal` allows (`paperclip.pr-watcher-rereview`). When Julian's approval is the only one on a pull request's head and it doesn't count by the HAL-14809 rules (the pull request is Liam's by its paths and neither Liam nor Julian wrote it, and it isn't a re-approval after a rebase-only push of a head Liam approved that `julianRebaseRefusal` allows, as the Merger's gate reads it), the PR watcher shall treat that pull request as not approved and give the task to Liam on the same pass, once per head, saying why; likewise when Nora's approval is the only one and it doesn't count (`paperclip.routine-review`), it shall give the task to the reviewer of its paths. It shall leave the task with its author when the task has an open child task, or when the author's newest comment on the task has the line `PR watcher: own review task` (a security or release pull request, which has a review task of its own). The host adapter shall refuse any handoff other than to one agent with status `todo`.

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
- Given pull request 5701 changing `pnpm-lock.yaml`, approved by Liam on `4999bbb` and only rebased since,
  when the watcher runs,
  then the approval carries over and the task goes to nobody; with Julian's approval on `4999bbb` instead, it goes to Liam.
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
- Given pull request 5701 with Julian's approval on its head `5701aaa`, the path rules saying Liam, and the watcher having handed `5701aaa` to Julian before,
  when the watcher runs twice,
  then it gives the task to Liam once, with the line "Julian's approval on #5701 doesn't count: it touches Liam's paths (HAL-14809), so Liam reviews it."
- Given the same pull request with Liam's approval on `4999bbb` and Julian's "re-approved on head `5701aaa` (rebase only, range-diff vs `4999bbb`)",
  when the watcher runs,
  then it leaves the task with its author when it changes `pnpm-lock.yaml`, and gives it to Liam when it changes `packages/x/src/sandbox/fence.ts`.
- Given Julian's approval on the head and the path rules saying Julian, or Liam's approval beside it, or a pull request Liam wrote,
  when the watcher runs,
  then it leaves the task with its author.
- Given the author handed the task on, closed it or started a run on it while the pass ran,
  when the host adapter is asked to hand it to the reviewer,
  then it writes nothing.
