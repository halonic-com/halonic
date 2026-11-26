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
  /**
   * C600 #4 (HAL-15608): the sandbox didn't work when the plugin started, as `halonic run` says it;
   * two sentences, so there is no second colon (Sofia, HAL-15616).
   */
  pluginStopped:
    "Didn't work: the connector {connector} didn't start. The sandbox didn't work when its plugin {name} started.",
  /** C655 row 49 (HAL-15936): the plugin's sandbox can't start here, as `halonic run` says it. */
  sandboxNotReady:
    "Didn't work: the connector {connector} didn't start: the sandbox its plugin runs in can't start on this computer.",
  notStarted: "Didn't work: the connector {connector} didn't start.",
  /**
   * The lines for a call the service, or Halonic for it, refused (`service-refused`, HAL-19185),
   * from the I7 card's 401, 403 and 429 rows (HAL-19173) and the HAL-19172 plan, section 2.3:
   * each says whose side the cause is on and one next step. They're filled from the log only,
   * never from the reply.
   */
  serviceNotAccepted:
    "Didn't work: the service didn't accept the token for the tool {tool}. It may be mistyped or revoked, so set a new one.",
  serviceNotAllowed:
    "Didn't work: the token isn't allowed to do what the tool {tool} asked. Check its permissions at the service.",
  serviceSlowDown:
    "Didn't work: the service asked Halonic to slow down when the tool {tool} called it. Try again in a few minutes.",
  serviceSlowDownRetried:
    "Didn't work: the service asked Halonic to slow down when the tool {tool} called it, and still did after Halonic tried again {times}. Try again in a few minutes.",
  /** `{host}` is only the main part of the host, such as `example.net`, so it can't pass for another service. */
  hostNotDeclared:
    "Didn't work: the tool {tool} tried to reach {host}, which its integration doesn't list. Halonic stopped it, so nothing reached {host}. Look at the integration's code.",
  /** Added to the 429 line only when the log shows nothing but a `GET` or `HEAD` went out twice. */
  nothingSentTwice: "{line} Nothing was sent twice.",
  /**
   * The line above a step's tool calls for a connector that couldn't list its tools when a turn
   * started, so the turn went without them: the `halonic tools review` lines decided on HAL-13829,
   * and for a plugin the cause of the plugin lines above (HAL-15278).
   */
  listingProgramMissing:
    "Couldn't list the tools from {connector}: its program {name} isn't on this computer.",
  listingSecretNotSet:
    "Couldn't list the tools from {connector}: it needs the secret {name}, which isn't set.",
  listingPluginNotTrusted:
    "Couldn't list the tools from {connector}: its plugin {name} isn't trusted yet.",
  listingPluginChanged:
    "Couldn't list the tools from {connector}: its plugin {name} changed since you trusted it.",
  listingPluginStopped:
    "Couldn't list the tools from {connector}: the sandbox didn't work when its plugin {name} started.",
  listingSandboxNotReady:
    "Couldn't list the tools from {connector}: the sandbox its plugin runs in can't start on this computer.",
  listingFailed: "Couldn't list the tools from {connector}.",
  /** `{connector}` when the log doesn't name the connector: "the connector of the tool `create_note` didn't start". */
  connectorOfTool: "of the tool {tool}",
  /** `{tool}` with its connector: "`create_note` (*notes-mcp*)". */
  toolFrom: "{tool} ({connector})",
  once: "once",
  twice: "twice",
  second: "1 second",
  seconds: "{count} seconds",
};
