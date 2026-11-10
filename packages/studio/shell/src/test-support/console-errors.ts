import { vi } from "vitest";
import { ShellError } from "../shell-error.ts";

/**
 * Stops React's report of each error a boundary catches from filling the test's output, and keeps
 * the reports for {@link reportedShellError}. A test calls it from `beforeEach`, and
 * `vi.restoreAllMocks()` from `afterEach`.
 */
export function quietConsoleErrors(): void {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
}

/** The `ShellError` React reported to the console for a boundary that caught it, if any. */
export function reportedShellError(): ShellError | undefined {
  return vi
    .mocked(console.error)
    .mock.calls.flat()
    .find((argument): argument is ShellError => argument instanceof ShellError);
}
