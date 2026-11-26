import type { Step, StepContext, StepOutcome } from "../runner.ts";
import {
  clickXPathWhenShown,
  lastWords,
  optionNamed,
  radioNamed,
  tabNamed,
  waitForText,
} from "../screen.ts";
import { configurationText } from "../words.ts";
import { onWorkspaceWithoutSettings } from "./open-demo.ts";
import { onWriterPage } from "./try-it.ts";

const { configuration, harness, model, halonic, codex, codexRefused, testModel } =
  configurationText;

/**
 * Step 23 (HAL-18930): the Model page uses the harness model check. On Writer's page from the Try
 * it steps, Configuration › Harness › Codex (saved at once), then Model › the demo's `default`, the
 * test model, which Codex can't call, shows Codex's sentence. Writer goes back to Halonic
 * afterwards, whether the sentence showed or not, so its Try it chat runs as before.
 */
export const harnessModel: Step = {
  id: "harness-model",
  title: "The Model page says Codex can't use the test model",
  requirements: ["agents.configuration.harness-model"],
  needs: ["engine-answers"],
  run: async (context) => {
    const workspace = await onWorkspaceWithoutSettings(context);
    if (!workspace.passed) return workspace;
    if (!(await onWriterPage(context))) return await failure(context, "NO_WRITER");
    if (!(await clickTab(context, configuration.text))) {
      return await failure(context, "NO_CONFIGURATION");
    }
    if (!(await pickHarness(context, codex.text))) return await failure(context, "NO_CODEX");
    const outcome = await refusedOnModelPage(context);
    const back = await pickHarness(context, halonic.text);
    if (!outcome.passed || back) return outcome;
    return await failure(context, "NOT_BACK_ON_HALONIC");
  },
};

/** Model › the test model, then waits for Codex's sentence under the picker. */
async function refusedOnModelPage(context: StepContext): Promise<StepOutcome> {
  if (!(await clickTab(context, model.text))) return await failure(context, "NO_MODEL_PAGE");
  if (!(await clickXPathWhenShown(context, optionNamed(testModel.text), 10_000))) {
    return await failure(context, "NO_TEST_MODEL");
  }
  // The harness saved a moment ago; the page reads it once the agent's file is read again.
  const shown = await waitForText(context, 30_000, (text) =>
    text.includes(codexRefused.text) ? true : undefined,
  );
  if (shown.value === true) return { passed: true };
  return { passed: false, code: "NO_REFUSAL", note: `Screen: ${lastWords(shown.text)}` };
}

/** Configuration › Harness, then the harness's option. */
async function pickHarness(context: StepContext, option: string): Promise<boolean> {
  return (
    (await clickTab(context, harness.text)) &&
    (await clickXPathWhenShown(context, radioNamed(option), 10_000))
  );
}

async function clickTab(context: StepContext, name: string): Promise<boolean> {
  return clickXPathWhenShown(context, tabNamed(name), 10_000);
}

async function failure(context: StepContext, code: string): Promise<StepOutcome> {
  const { text } = await waitForText(context, 0, () => undefined);
  return { passed: false, code, note: `Screen: ${lastWords(text)}` };
}
