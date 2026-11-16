import { useEffect, useRef, useState } from "react";
import type { ModelsFiles } from "../api.ts";
import { type ModelsState, readModels } from "./read-models.ts";

/**
 * The workspace's aliases and providers, read again each time `models.yaml` or a provider file
 * changes; only the newest read is shown. `retry` reads again after a failure: the failure stays
 * on screen with `retrying` true, never the loading state, and `onRetried` runs once a retry reads
 * the file, so the screen can move focus off the button that is gone.
 */
export function useModels(
  files: ModelsFiles,
  onRetried?: () => void,
): [ModelsState, () => void, boolean] {
  const [state, setState] = useState<ModelsState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const retried = useRef(onRetried);
  retried.current = onRetried;
  const retryingNow = useRef(false);
  useEffect(() => {
    let current = true;
    let latest = 0;
    const refresh = () => {
      const read = ++latest;
      void readModels(files).then((state) => {
        if (!current || read !== latest) return;
        setState(state);
        if (!retryingNow.current) return;
        retryingNow.current = false;
        setRetrying(false);
        if (state.status === "ready") retried.current?.();
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
    retryingNow.current = true;
    setRetrying(true);
    setAttempt((count) => count + 1);
  };
  return [state, retry, retrying];
}
