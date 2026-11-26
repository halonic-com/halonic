# paperclip.merger-wake

- Status: active
- Since: unreleased
- Source: HAL-19234 (ci-fasttrack on HAL-18424, 26 Nov: a wake through the Supervisor's credential failed every woken run, and Chief decided not to share the Merger's credential, so the Agent tools plugin wakes the Merger on its own task, as the chief line wakes Chief)

While `mergerWake.enabled` is on and `mergerWake.task` names a task, the Agent tools plugin shall read the open pull requests of its first repository on the read token, at each `merger-wake` job pass (every minute) and 10 seconds after the first of a burst of `POST /chief-line/pr-event` deliveries, and shall compare each pull request's head, base, review decision, check rollup state and labels, and which pull requests are open, with the previous read. When one of them changed, or a delivery carried a signed approval for a pull request of that repository, it shall start a run of the task's holder with no task, as the holder's heartbeat does, with reason `merger_pr_change` and a prompt that names the changes and asks for one pass as on a timer heartbeat, at most once every 45 seconds: a change within 45 seconds of the last wake shall wake once at the 45-second mark. While a run on the task or of its holder is in progress, or when the holder's timer heartbeat is due within 30 seconds (its last heartbeat plus its interval), it shall not wake, and the next pass shall try again. Within 45 seconds of the last wake, while such a run is in progress, and while the timer heartbeat is that close, a pass shall not read GitHub. If the wake fails, its changes shall stay for the next wake. The first read after the plugin starts only takes the baseline. A change in `updatedAt` alone shall wake nobody. If GitHub answers that its rate limit is used up, it shall log one line and read nothing more until GitHub's reset time (15 minutes when GitHub names none, at least one minute). While it is off, it shall read nothing and wake nobody.

## Examples

- Given #6085 is open with head `aaa…`,
  when the next read shows head `bbb…`,
  then the Merger is woken once with no task, its prompt asks for one pass as on a timer heartbeat, and the log says "woke the Merger for #6085 head".
- Given a wake at 07:00:00,
  when #6085's labels change at 07:00:10,
  then the next wake is at 07:00:45.
- Given a Merger run is in progress,
  when #6086 opens,
  then GitHub isn't read and nobody is woken until a pass finds the run over.
- Given the Merger's 60-second timer heartbeat last ran at 07:00:00,
  when #6085's checks change and a pass runs at 07:00:35,
  then nobody is woken and GitHub isn't read; a pass after the timer heartbeat has run may wake.
- Given GitHub's read limit is used up until 07:20 UTC,
  when passes run each minute until then,
  then GitHub is not read again before 07:20 and one line is logged.
- Given a signed approval for #6085 arrives on `pr-event` at 07:00:00,
  when 10 seconds have passed,
  then the Merger is woken for "#6085 approval".
