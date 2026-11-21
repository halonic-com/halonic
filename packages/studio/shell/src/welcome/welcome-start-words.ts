import type { FailedCause } from "./start-status.ts";

/**
 * Welcome's words while Studio starts and when its engine didn't start (first-run-progress 3.2
 * and 9, with Maya's edits from HAL-13414 for the 10 s line, the 60 s sentence and the buttons'
 * line).
 */
export const welcomeStartWords = {
  starting: "Starting Halonic…",
  /** Joins the line at 10 s. */
  firstStart: "The first start takes longer than the next ones.",
  /** Takes the 10 s sentence's place at 30 s. */
  stillStarting:
    "Still starting. The first start unpacks Halonic's files, which can take up to a minute.",
  /** Why Open demo and Open folder are off, from 2 s and while the start has failed. */
  buttonsOff: (demo: boolean) =>
    demo
      ? "Open demo and Open folder work once the engine is running."
      : "Open folder works once the engine is running.",
  /** Said once, politely, when the start ends after the line showed. */
  ready: "Halonic is ready",
  somethingWrong: "Something wrong?",
  failedTitle: "Halonic's engine didn't start",
  tryAgain: "Try again",
  checkThisComputer: "Check this computer",
  copyReport: "Copy report",
  /** The sentence under the title, by cause. The report holds the cause id and the exit code. */
  causes: {
    timed_out:
      "Halonic waited a minute and got no answer from its engine. Nothing ran, and your files weren't changed. Try again, or check this computer to see why.",
    other:
      "Halonic's engine couldn't start. Nothing ran, and your files weren't changed. Try again, or check this computer to see why.",
    missing:
      "Some of Halonic's files are missing or damaged. Reinstall Halonic, then open it again.",
    broken:
      "Some of Halonic's files are missing or damaged. Reinstall Halonic, then open it again.",
    blocked:
      "Something on this computer blocked Halonic from starting, such as an antivirus program. Allow Halonic, then try again.",
    stopped:
      "Halonic's engine stopped while it was starting. Try again. If it happens again, copy the report and send it with your question.",
    wsl_failed:
      "WSL didn't answer when Halonic started its engine. Restart Windows, then try again.",
  } satisfies Record<FailedCause, string>,
} as const;
