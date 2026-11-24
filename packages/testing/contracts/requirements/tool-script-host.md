# contracts.tool-script-host

- Status: active
- Since: unreleased
- Source: ADR "Halonic ToolScript" (`docs/adr/2026-11-24-toolscript.md`, sections 2.3, 3.2 S3, S4, S9, S13, S15 and 6), accepted by the board on HAL-10 on 24 Nov; task HAL-17566; requirement `ports.tool-script-host`

Where an adapter implements `ToolScriptHost`, it shall pass this suite for its own audience against an invented `acme` registry, with no network. It shall return a script's output with the capability ids it called and its log, and shall give `ctx` only the capabilities in `uses`. It shall confirm each write, and no read, with exactly the plain-data copy it then sends, and stop with `toolscript.declined` when the write is declined. Before anything runs, it shall refuse an artifact, a registry or a `uses` capability of the other audience (`toolscript.wrong-audience`), code whose SHA-256 isn't its `codeHash`, a capability the registry lacks, a `uses` entry that isn't a capability id or a header limit that isn't a positive whole number (`toolscript.bad-artifact`), and input over the input limit, calling and confirming nothing. It shall stop at the call, output and log limits, where a header can lower a limit and a request can't raise it, cut long log lines, and refuse arguments over 8 KB, deeper than 8 levels or holding a function (`toolscript.bad-argument`) and an output that isn't plain data (`toolscript.bad-output`). It shall report a thrown error by its message only, `ctx.fail` as `toolscript.failed`, a failing capability as `toolscript.capability-failed`, and a cancel as `toolscript.cancelled`, aborting the signal it gave the capability, and shall run nothing when cancelled before it starts.

## Examples

- Given a script that reads `acme.get-note@1` and writes its text with `acme.set-note@1`,
  when it runs,
  then the output is the note, the calls are both ids in order, and the confirm step saw exactly the one write that was sent.
- Given the same script and a declined confirm,
  when it runs,
  then the result is `toolscript.declined` and nothing was sent.
- Given a header with the audience the host doesn't run,
  when it runs,
  then the result is `toolscript.wrong-audience` with no call and no confirm.
- Given a header that lowers `calls` to 2, a request that asks for 10, and a script that calls 5 times,
  when it runs,
  then the result is `limit.calls` after 2 calls.
- Given a script that throws `new Error("broken on purpose")`,
  when it runs,
  then the result is `toolscript.script-error` with the message "broken on purpose" and no stack.
