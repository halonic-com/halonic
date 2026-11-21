# sandbox-srt.forget-after-admin-removal

- Status: active
- Since: unreleased
- Source: HAL-5404, HAL-5407 (S2), HAL-14806, HAL-7544, HAL-7585

When a removal of the Windows sandbox runs with administrator rights and so skips the grants srt kept for this user, the sandbox-srt adapter shall write nothing of its own for them, and its log line shall say the grants are taken back at the next start only when srt then lists kept grants while its sandbox account is gone, and otherwise how to take them back. Once after a host that holds the profile's lock starts, before its sweep and before its first open, and before every setup, the adapter shall take back every grant srt kept for this user (`profile forget`, `acl forget --all`) when srt lists kept grants while its sandbox account is gone. It shall do this only in a process without administrator rights, and log it when it skips it for them; a failure shall be logged, tried again at the next start, and stop neither sessions nor the setup. A host without the lock, and other systems, shall do none of this at the start.

## Examples

- Given Windows and a removal with administrator rights that skipped the user's kept grants, after which srt lists kept grants and no sandbox account,
  when it finishes,
  then it took nothing back itself and the log line says the grants are taken back at the next start, or by `srt-win acl forget --all`.
- Given the same removal, but srt still lists its sandbox account,
  when it finishes,
  then the log line says to remove it again without administrator rights.
- Given srt lists kept grants while its sandbox account is gone,
  when a host without administrator rights that holds the lock starts its sweep,
  then it takes back the profile read grant and every kept write grant before the sweep.
- Given the same, and `acl forget --all` fails,
  when that host starts its sweep,
  then a log line says why, and sessions still open.
- Given the same, and a host that runs with administrator rights,
  when it starts its sweep,
  then it takes nothing back, and a log line says why.
- Given srt lists its sandbox account, or its status can't be read,
  when that host starts its sweep,
  then it forgets nothing beyond the sweep.
- Given kept grants without a sandbox account, and a host that doesn't hold the lock,
  when it opens a session,
  then it takes nothing back.
- Given kept grants without a sandbox account,
  when the user sets the sandbox up again,
  then they are taken back in the user's own process before the install, and a failure is logged and the setup goes on.
