// A run that names a harness for all its agents (`halonic run --harness`,
// HAL-189 6b) moves agents from Halonic's own loop into a program. Such an
// agent's file may still name allowed sites or a working folder, but the
// trust prompt and the working-folder check only read those for agents
// whose file names a harness. So a run that would switch such an agent
// doesn't start: the program would get sites and a folder no one was shown
// or checked.

import { KindedError } from "@halonicjs/std";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import type { Message } from "./messages/define.ts";
import { plainText } from "./messages/phrase.ts";
import { runMessages } from "./messages/run.ts";
import { programAgentsOf, type SandboxGateRun, startsAProgram } from "./sandbox-gate.ts";

/**
 * Refuses a run whose harness would move an agent from Halonic's own loop
 * into a program while its file names allowed sites or a working folder.
 * A run without a harness of its own, or with `halonic`, always passes.
 *
 * @param ending - what line 1 ends with: "Nothing ran." for `run`, "Nothing was sent." for `runs send`
 * @throws KindedError `invalid_input` naming the first such agent (exit 2); nothing ran
 */
export function checkHarnessOverride(
  workspace: LoadedWorkspace,
  run: SandboxGateRun,
  ending: Message,
): void {
  if (!startsAProgram(run.harness)) return;
  for (const { value: agent } of programAgentsOf(workspace, run)) {
    const switched = !startsAProgram(agent.harness);
    const unchecked = (agent.allowedSites ?? []).length > 0 || agent.workingFolder !== undefined;
    if (switched && unchecked) {
      throw new KindedError(
        "invalid_input",
        plainText(runMessages.uncheckedHarnessFields(agent.name, ending.phrase).phrase),
        { fix: plainText(runMessages.uncheckedHarnessFieldsFix(agent.name).phrase) },
      );
    }
  }
}
