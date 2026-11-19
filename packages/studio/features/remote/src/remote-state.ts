import type { RemoteControl, RemoteState } from "@halonicjs/ports";
import { useEffect, useState } from "react";

/**
 * Follows `remote.state()` until the function it gives back is called, calling `onState` with
 * each snapshot. A stream that fails or ends calls `onEnd` with the error, if any.
 */
export function followRemote(
  remote: RemoteControl,
  onState: (state: RemoteState) => void,
  onEnd: (error?: unknown) => void = () => undefined,
): () => void {
  const iterator = remote.state()[Symbol.asyncIterator]();
  let live = true;
  const next = (): void => {
    iterator.next().then(
      (step) => {
        if (!live) return;
        if (step.done === true) {
          onEnd();
          return;
        }
        onState(step.value);
        next();
      },
      (error: unknown) => {
        if (live) onEnd(error);
      },
    );
  };
  next();
  return () => {
    live = false;
    void iterator.return?.();
  };
}

/** The first snapshot of `remote.state()`, for a summary line that needs no updates. */
export function remoteNow(remote: RemoteControl): Promise<RemoteState> {
  return new Promise((resolve, reject) => {
    const stop = followRemote(
      remote,
      (state) => {
        stop();
        resolve(state);
      },
      (error) => reject(error ?? new Error("the host's remote state ended before it began")),
    );
  });
}

/**
 * The latest snapshot of `remote.state()`, or `undefined` before the first one or without a host.
 * A stream that fails throws in render, so the view's error boundary shows it.
 */
export function useRemoteState(remote: RemoteControl | undefined): RemoteState | undefined {
  const [state, setState] = useState<RemoteState>();
  const [failed, setFailed] = useState<{ error: unknown }>();
  useEffect(() => {
    if (remote === undefined) return;
    return followRemote(remote, setState, (error) => {
      if (error !== undefined) setFailed({ error });
    });
  }, [remote]);
  if (failed !== undefined) throw failed.error;
  return state;
}
