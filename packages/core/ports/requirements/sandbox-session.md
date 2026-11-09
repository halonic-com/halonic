# ports.sandbox-session

- Status: active
- Since: 0.1.0
- Source: plan section 4.5 (the two ports): a session starts programs with their standard streams, reports blocked accesses and stops everything when the run ends

The `Sandbox` port shall report whether it works and how files reach it and how strong its fence is, and `open` shall return a session that starts programs with standard input, output and error as Web streams, reports each blocked file or network access, and stops every program it started on `close`, on the time limit and when the signal given to `open` aborts.

## Examples

- Given a `Sandbox`,
  when Halonic asks `capabilities`,
  then it gets how files reach the sandbox (`shared` or `copied`) and its strength (`os`, `vm` or `remote`).
- Given a session,
  when it starts a program,
  then it gets the program's three streams and a promise of how it ended that never rejects.
- Given a blocked access,
  when the session reports it,
  then it says whether a file (with its path and read or write) or a network address (with host and port) was refused.
- Given a `Sandbox` with a `files` value other than `shared` or `copied`,
  when it is compiled,
  then it doesn't compile.
