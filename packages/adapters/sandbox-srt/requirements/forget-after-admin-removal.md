# sandbox-srt.forget-after-admin-removal

- Status: active
- Since: unreleased
- Source: HAL-5404, HAL-5407 (S2), HAL-14806, HAL-7544, HAL-7585

When a removal of the Windows sandbox runs with administrator rights and so skips the grants srt kept for this user, the sandbox-srt adapter shall leave a mark in the profile (`agent-host/forget-pending`, an empty file it only ever creates new and never writes through, and never reads paths or arguments from), and its log line shall say the grants are taken back at the next start. Once after a host that holds the profile's lock starts, before its sweep and before its first open, the adapter shall take back every grant srt kept for this user (`profile forget`, `acl forget --all`) when the mark is there, or when srt lists kept grants while its sandbox account is gone. It shall do this only in a process without administrator rights, and log it when it skips it for them; only a success shall take the mark away, and a failure shall be logged, tried again at the next start, and not stop sessions. A host without the lock, and other systems, shall do none of this.

## Examples

- Given Windows and a removal with administrator rights that skipped the user's kept grants,
  when it finishes,
  then the mark is in the profile and the log line says the grants are taken back at the next start.
- Given a file or link already at the mark's place,
  when a removal with administrator rights leaves the mark,
  then what is there is left as it was and counts as the mark.
- Given the mark in the profile,
  when a host without administrator rights that holds the lock starts its sweep,
  then it takes back the profile read grant and every kept write grant before the sweep, and the mark is gone.
- Given no mark, but srt lists kept grants while its sandbox account is gone,
  when that host starts its sweep,
  then it takes them back too.
- Given the mark, and `acl forget --all` fails,
  when that host starts its sweep,
  then the mark stays, a log line says why, and sessions still open.
- Given the mark, and a host that runs with administrator rights,
  when it starts its sweep,
  then it takes nothing back, the mark stays, and a log line says why.
- Given neither the mark nor kept grants without a sandbox account,
  when that host starts its sweep,
  then it forgets nothing beyond the sweep.
- Given the mark, and a host that doesn't hold the lock,
  when it opens a session,
  then it takes nothing back.
