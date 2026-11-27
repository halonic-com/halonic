# toolscript-fence.ctx-fail

- Status: active
- Since: unreleased
- Source: task HAL-20448, for the `ctx` host's contract (HAL-17570); `ports.tool-script-host` reserves `fail` as one of `ctx`'s own members

Where an isolate implements `ToolScriptIsolate`, `ctx` shall hold a frozen `fail` of its own, and a script's call `ctx.fail(message)`, with or without `await`, shall end the run at once with `toolscript.failed` and the message; nothing the script does after the call, even when it catches the error the call throws, shall reach the log or the result.

## Examples

- Given the script `try { ctx.fail("nothing to copy"); } catch {} ctx.log("after fail"); return 1;`,
  when it runs,
  then the result is `toolscript.failed` with the message "nothing to copy" and an empty log.
