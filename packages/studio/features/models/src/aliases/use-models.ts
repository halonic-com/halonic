import { useEffect, useState } from "react";
import type { ModelsFiles } from "../api.ts";
import { type ModelsState, readModels } from "./read-models.ts";

/** The workspace's aliases, read again each time `models.yaml` changes. */
export function useModels(files: ModelsFiles): ModelsState {
  const [state, setState] = useState<ModelsState>({ status: "loading" });
  useEffect(() => {
    let current = true;
    const refresh = () =>
      void readModels(files).then((read) => {
        if (current) setState(read);
      });
    refresh();
    const stop = files.subscribe(refresh);
    return () => {
      current = false;
      stop();
    };
  }, [files]);
  return state;
}
