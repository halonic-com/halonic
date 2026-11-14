import { useEffect, useState } from "react";
import type { ModelsFiles } from "../api.ts";
import { type ModelsState, readModels } from "./read-models.ts";

/** The workspace's aliases, read again each time `models.yaml` changes; only the newest read is shown. `retry` reads again after a failure. */
export function useModels(files: ModelsFiles): [ModelsState, () => void] {
  const [state, setState] = useState<ModelsState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    let latest = 0;
    const refresh = () => {
      const read = ++latest;
      void readModels(files).then((state) => {
        if (current && read === latest) setState(state);
      });
    };
    refresh();
    const stop = files.subscribe(refresh);
    return () => {
      current = false;
      stop();
    };
  }, [files, attempt]);
  const retry = () => {
    setState({ status: "loading" });
    setAttempt((count) => count + 1);
  };
  return [state, retry];
}
