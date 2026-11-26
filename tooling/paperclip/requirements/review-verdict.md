# paperclip.review-verdict

- Status: active
- Since: unreleased
- Source: HAL-19481, 2.1 of the plan on HAL-19228 with Liam's changes from HAL-19325: bind review verdicts to the reviewer's own Paperclip run

When a reviewer's agent calls `review_verdict` with a repository, a pull request, a task, a verdict (`approved`, `changes-requested`, `withdrawn` or `security-ok`) and a full 40-character head, the plugin shall record the verdict as a new plugin entity that it never changes, with the head, the fingerprint of the pull request's whole diff against its merge base, the reviewer, the calling agent and run, the task and Paperclip's time, and post the verdict's line on the task with the reviewer as its author, only when every check passes:
- the plugin's settings name the calling agent as a reviewer (`verdictReviewers`), and only Julian records `security-ok`;
- Paperclip confirms the calling run holds the task (`assertCheckoutOwner`, with the same checkout run) and lists it among the task's running runs;
- the task is the one the branch names (`<agent>/HAL-<n>-…`), or its title or description links the pull request and names its branch;
- the pull request is open and its current head is the head named;
- the author is worked out (`authorOf`): the agent the branch names, only when that agent named the pull request in a comment of its own (not a Paperclip receipt) on the task or the branch's task; a pull request another GitHub account opened has that account as its author;
- the HAL-14809 rules allow it: nobody records a verdict on their own pull request, an approval must count by `judgeApprovals` on the head, and `withdrawn` needs the caller's own open change request.

Otherwise it shall answer why and record nothing. It reads GitHub with GET requests only.

## Examples

- Given Elena's open `elena/HAL-1-…` pull request that she named on HAL-1, and Liam's run holding HAL-1,
  when Liam records `approved` on its head,
  then a record with that head and Liam's run is added and "Liam: approved on head `<sha>`" is posted on HAL-1 as Liam.
- Given the same pull request and Liam's run that has finished,
  when the tool is called with that run,
  then it answers that the run doesn't hold the task, and nothing is recorded.
- Given a `liam/…` pull request where Liam named it on the task,
  when Liam records `approved`,
  then it answers that it's his own pull request.
- Given a pull request on Liam's paths,
  when Julian records `approved`,
  then it answers that it's outside Julian's limits; his `changes-requested` there can later be `withdrawn` by him alone.
