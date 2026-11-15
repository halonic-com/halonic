import type { RunRow } from "@halonicjs/studio-feature-runs/api";
import type { WorkflowRef, WorkflowsHost } from "../api.ts";
import { useHostRead } from "../page/use-workflow.ts";
import { isFinished } from "./runs-model.ts";
import { runsWords as words } from "./runs-words.ts";
import type { SaveAsTestProps } from "./save-as-test.tsx";

/**
 * What a run's card needs for **Save as test**, for the rows that can have it: a finished run, when
 * the host can write test cases. It reads the workflow's tests for the names that are taken; the
 * names are empty until they load, and the host has the last word on a name it can't take.
 */
export function useSaveAsTest(
  host: WorkflowsHost,
  workflow: WorkflowRef,
  onSaved: (testName: string) => void,
): (row: RunRow) => SaveAsTestProps | undefined {
  const { saveRunAsTest } = host;
  const { load } = useHostRead(host, workflow, (one, ref) =>
    one.saveRunAsTest ? one.tests(ref) : Promise.resolve({ cases: [] }),
  );
  const taken = load.kind === "ready" ? load.value.cases.map((one) => one.name) : [];
  return (row) =>
    saveRunAsTest && isFinished(row)
      ? {
          defaultName: words.defaultName(row.shortId),
          taken,
          save: (testName) => saveRunAsTest.call(host, workflow, row.id, testName),
          onSaved,
        }
      : undefined;
}
