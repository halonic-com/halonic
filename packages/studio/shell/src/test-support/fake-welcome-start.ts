import { act } from "react";
import type { LiteCheckResult, StartReport, WelcomeStart } from "../welcome/start-status.ts";

/** What the lite check finds on a Mac where all is well. */
export const allWell: readonly LiteCheckResult[] = [
  { id: "app_files", fact: "present" },
  { id: "profile_writable", fact: "writable" },
  { id: "disk_space", fact: "enough" },
];

/**
 * A start the test drives: `answer` is the window's next `start_status`, and the lite check
 * finds `results`. It counts Try again and the checks.
 */
export class FakeWelcomeStart implements WelcomeStart {
  report: StartReport | undefined = undefined;
  results: readonly LiteCheckResult[] = allWell;
  tries = 0;
  checks = 0;
  readonly about = "Halonic 0.1.0 · macOS";
  private readonly listeners = new Set<() => void>();

  subscribe(onChange: () => void): () => void {
    this.listeners.add(onChange);
    return () => this.listeners.delete(onChange);
  }

  /** Gives Welcome the window's next answer, inside `act`. */
  answer(report: Partial<StartReport> & Pick<StartReport, "state" | "seconds">): void {
    this.report = { phase: "engine_ready", cause: null, exitCode: null, ...report };
    act(() => {
      for (const listener of this.listeners) listener();
    });
  }

  async tryAgain(): Promise<void> {
    this.tries += 1;
  }

  async check(): Promise<readonly LiteCheckResult[]> {
    this.checks += 1;
    return this.results;
  }
}
