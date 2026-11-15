import { RunsListService } from "@halonicjs/studio-feature-runs/api";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { type ModelsState, readModels } from "../aliases/read-models.ts";
import { ModelKeysService, ModelsFilesService } from "../api.ts";
import { monthSpent } from "../spend/month-spent.ts";
import { lookUpKeys, problems, secretsToCheck } from "./problems.ts";

/**
 * Whether the section has a chip, for the mark on its row in the Settings list. It reads
 * everything once, when the list asks; the section's own chips stay live.
 */
export async function hasProblems(context: WorkspaceContext): Promise<boolean> {
  const state = await readModels(context.services.get(ModelsFilesService));
  const stored = await lookUpKeys(context.services.find(ModelKeysService), secretsToCheck(state));
  const spent = monthSpent(context.services.find(RunsListService)?.state);
  return problems({ state, spent, stored }).length > 0;
}

/** The section's chips, kept up to date with the files, the run list and the stored keys. */
export function useProblems(context: WorkspaceContext, state: ModelsState): string[] {
  const list = context.services.find(RunsListService);
  const keys = context.services.find(ModelKeysService);
  const subscribe = useCallback(
    (listener: () => void) => list?.subscribe(listener) ?? (() => undefined),
    [list],
  );
  const spent = monthSpent(useSyncExternalStore(subscribe, () => list?.state));
  const secrets = secretsToCheck(state).join("\n");
  const [stored, setStored] = useState<ReadonlyMap<string, boolean>>(new Map());
  useEffect(() => {
    let current = true;
    void lookUpKeys(keys, secrets === "" ? [] : secrets.split("\n")).then(
      (found) => current && setStored(found),
    );
    return () => {
      current = false;
    };
  }, [keys, secrets]);
  return problems({ state, spent, stored });
}
