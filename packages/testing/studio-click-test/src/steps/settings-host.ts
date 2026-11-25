import type { Step, StepContext, StepOutcome } from "../runner.ts";
import { clickWhenShown, waitForText } from "../screen.ts";
import { sandboxChips, settingsText } from "../words.ts";
import { failure, openSection } from "./settings-display.ts";

/** The sandbox check asks the agent host, which may still be starting WSL. */
const sandboxCheckWaitMs = 60_000;
const updateStatusWaitMs = 30_000;

/**
 * Settings › Agent sandbox shows a state chip once the host's check answers,
 * and About Halonic shows the updater's status, Check now and the automatic
 * switch. Neither presses a button: a setup asks for administrator rights.
 */
export const settingsHostSections: Step = {
  id: "settings-host-sections",
  title: "Settings › Agent sandbox shows its state, About Halonic its updates",
  requirements: [
    "settings.agent-sandbox-section",
    "settings.agent-sandbox-state",
    "settings.about-section",
  ],
  run: async (context) => {
    const sandbox = await sandboxState(context);
    if (!sandbox.passed) return sandbox;
    return updateStatus(context);
  },
};

async function sandboxState(context: StepContext): Promise<StepOutcome> {
  const opened = await openSection(context, settingsText.agentSandbox.text);
  if (!opened.passed) return opened;
  const { sandboxNotChecked, sandboxChecking } = settingsText;
  // A chip's word, such as Ready, can show elsewhere in the window, so the
  // check counts as answered only once its "Checking the sandbox…" is gone.
  const state = await waitForText(context, sandboxCheckWaitMs, (text) => {
    if (text.includes(sandboxNotChecked.text)) return "SANDBOX_NOT_CHECKED";
    if (text.includes(sandboxChecking.text)) return undefined;
    return sandboxChips.some((chip) => text.includes(chip.text)) ? "shown" : undefined;
  });
  if (state.value === "shown") return { passed: true };
  return failure(state.value ?? "NO_SANDBOX_STATE", state.text);
}

async function updateStatus(context: StepContext): Promise<StepOutcome> {
  const { about, checkNow, automatic, updaterDidntAnswer } = settingsText;
  if (!(await clickWhenShown(context, about.text, 10_000))) {
    const { text } = await waitForText(context, 0, () => undefined);
    return failure("NO_SETTINGS", text, `No ${about.text} row in Settings.`);
  }
  const status = await waitForText(context, updateStatusWaitMs, (text) => {
    if (text.includes(updaterDidntAnswer.text)) return "UPDATER_DIDNT_ANSWER";
    return text.includes(checkNow.text) && text.includes(automatic.text) ? "shown" : undefined;
  });
  if (status.value === "shown") return { passed: true };
  return failure(status.value ?? "NO_UPDATE_STATUS", status.text);
}
