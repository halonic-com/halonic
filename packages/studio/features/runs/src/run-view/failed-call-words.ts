/**
 * The quiet line under a tool call that failed, after its ✕ (HAL-12415, option a, decided by
 * Chief with Sofia; microcopy 1.6, E1 and E5). The reason is only one the log gives in a typed
 * field; without one the line says only that it didn't work. "Broke off without an answer, so it
 * may or may not have done its work" is the engine's own sentence for the outcome `unknown`, so
 * Studio and the command line say the same (E4).
 */
export const failedCallWords = {
  failed: "Didn't work.",
  noAnswer:
    "Didn't work: the tool {tool} broke off without an answer, so it may or may not have done its work.",
  noAnswerFrom:
    "Didn't work: the tool {tool} ({connector}) broke off without an answer, so it may or may not have done its work.",
};
