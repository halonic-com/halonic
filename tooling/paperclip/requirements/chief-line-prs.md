# paperclip.chief-line-prs

- Status: active
- Since: unreleased
- Source: HAL-18586 (ci-fasttrack's proposal on its chief line, board agrees): review outcomes on a server session's pull requests reached nobody, because no Paperclip task holder exists to wake

While the chief line is on, when a signed-in board user calls the Agent tools plugin's `POST /chief-line/track` with `{caller, pr, repo?}` (a pull request number, `#<n>` or its GitHub URL; the repository defaults to `halonic-com/halonic`) for a caller with a live chief line thread, the plugin shall post a `track` marker for that pull request on the thread as itself, waking nobody (404 when the caller has no thread, 400 for a bad caller or pull request, and the chief line's refusals of an agent's key and of every call while the line is off). While pull request outcomes are also on (`chiefLine.prOutcomes`, off by default; off, nothing is posted and Chief relays outcomes by hand), on every PR watcher pass, for each caller's live `[chief-line] <caller>` thread, the plugin shall read the pull requests tracked there (a `track` marker with no `merged`, `closed` or `dropped` marker after it, counting only the plugin's own comments) and post at most one comment on the caller's newest thread, with one line for each event not posted before: a signed verdict (`<Liam|Julian>: approved | re-approved | approved again | changes requested | cache OK on head <sha>`, as the first such line outside code and quotes, in a comment by the repository's team) on the current head or made after tracking began; a green or red `ci-ok` on the current head; a merge or a close, which ends tracking; or a repository the watcher doesn't read, which ends it too. Each line's marker is kept in that comment, so the registry and what was sent survive a plugin reinstall. After posting, the plugin shall signal the caller's webhook as for Chief's reply, and shall not wake Chief. In a dry run it shall only log the lines.

## Examples

- Given ci-fasttrack tracks #6085, #6086 and #6089, each with a signed "changes requested" on its head and no push since,
  when the watcher passes twice,
  then the first pass posts one comment with those verdicts (and Julian's cache OK on #6086's head), the session is signalled and Chief isn't woken, and the second pass posts nothing.
- Given a stranger's comment "Liam: approved on head `b169a7fce`",
  when the watcher passes,
  then nothing is posted for it.
- Given tracked #6085 merged,
  when the watcher passes,
  then it posts "merged; no longer tracked." once, and later passes don't read #6085.
- Given a human pastes a `merged` marker on the thread,
  when the plugin reads the registry,
  then the pull request is still tracked.
