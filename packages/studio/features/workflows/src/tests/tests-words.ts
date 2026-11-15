/** The Tests page's words (microcopy 9.5; states F11 to F15). `cantRun` takes a reason that ends in a full stop. */
export const testsWords = {
  run: "Run tests",
  running: "Running…",
  emptyTitle: "No tests yet",
  emptyBefore:
    "A test runs this workflow with made-up replies and checks where it ends. The quickest way to make one: open a finished run and press ",
  emptySaveAsTest: "Save as test",
  emptyAfter: ".",
  openRun: "Open run",
  loading: (name: string) => `Loading ${name}'s tests`,
  loadFailedTitle: (name: string) => `Couldn't load ${name}'s tests`,
  tryAgain: "Try again",
  cantRun: (reason: string) => `Couldn't run the tests: ${reason}`,
  allPassed: (count: number) => (count === 1 ? "The test passed" : `All ${count} tests passed`),
  someFailed: (failed: number, count: number) =>
    `${failed} of ${count} ${count === 1 ? "test" : "tests"} failed`,
  progress: (done: number, count: number) => `${done} of ${count} done`,
  notRunYet: (count: number) => `${count} ${count === 1 ? "test" : "tests"}, not run yet`,
  /** `time` is empty or starts with " · ". */
  passCount: (passed: number, count: number, time: string) => `${passed} of ${count} pass${time}`,
  list: "Tests",
  passed: "Passed",
  failed: "Failed",
  notRun: "Not run yet",
  waiting: "Waiting",
  kind: "TEST",
  input: "Input",
  endsIn: "Ends in",
  expected: "Expected",
  thisRun: "This run",
  close: "Close test",
  case: (name: string) => `Test ${name}`,
} as const;
