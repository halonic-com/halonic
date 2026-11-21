/**
 * The quiet line under a tool call that failed, after its ✕ (HAL-12415, option a, decided by
 * Chief with Sofia; microcopy 1.6, E1 and E5). The reason is only one the log gives in a typed
 * field; without one the line says only that it didn't work. "Broke off without an answer, so it
 * may or may not have done its work" is the engine's own sentence for the outcome `unknown`, so
 * Studio and the command line say the same (E4).
 *
 * `{tool}` is the tool's name, with its connector in brackets when the log names it. The lines
 * for a cause the engine logged (`events.tool-result-cause`, HAL-12471): the one for a time limit
 * is the example microcopy 1.6 gives, the connector-start ones were decided by the team on
 * HAL-13829, the plugin ones by the team from words check C557 (HAL-15278), as `halonic run` says
 * them, and the others by the team on HAL-12471. A call that ran out of time or that the
 * engine stopped may still have done its work, so those lines say so, as the `unknown` one does.
 */
export const failedCallWords = {
  failed: "Didn't work.",
  noAnswer:
    "Didn't work: the tool {tool} broke off without an answer, so it may or may not have done its work.",
  timeLimit:
    "Didn't work: the tool {tool} didn't answer within {seconds}, so it may or may not have done its work.",
  engineStopped:
    "Didn't work: Halonic stopped while the tool {tool} was running, so it may or may not have done its work.",
  notConnected:
    "Didn't work: the call to {tool} wasn't made, because its connector isn't connected.",
  toolGone:
    "Didn't work: the call to {tool} wasn't made, because its connector no longer offers it.",
  sendingOff: "Didn't work: the call to {tool} wasn't made, because sending is turned off.",
  badArguments:
    "Didn't work: the call to {tool} wasn't made, because the model gave it arguments that aren't usable.",
  programMissing:
    "Didn't work: the connector {connector} didn't start: its program {name} isn't on this computer.",
  secretNotSet:
    "Didn't work: the connector {connector} didn't start: it needs the secret {name}, which isn't set.",
  pluginNotTrusted:
    "Didn't work: the connector {connector} didn't start: its plugin {name} isn't trusted yet.",
  pluginChanged:
    "Didn't work: the connector {connector} didn't start: its plugin {name} changed since you trusted it.",
  notStarted: "Didn't work: the connector {connector} didn't start.",
  /** `{connector}` when the log doesn't name the connector: "the connector of the tool `create_note` didn't start". */
  connectorOfTool: "of the tool {tool}",
  /** `{tool}` with its connector: "`create_note` (*notes-mcp*)". */
  toolFrom: "{tool} ({connector})",
  second: "1 second",
  seconds: "{count} seconds",
};
