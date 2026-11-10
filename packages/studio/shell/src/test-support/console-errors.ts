import { ShellError } from "../shell-error.ts";

/**
 * The `ShellError` React reported to the console for a boundary that caught it, if any. A test
 * passes the calls of its `console.error` spy: `vi.mocked(console.error).mock.calls`.
 */
export function reportedShellError(calls: readonly (readonly unknown[])[]): ShellError | undefined {
  return calls.flat().find((argument): argument is ShellError => argument instanceof ShellError);
}
