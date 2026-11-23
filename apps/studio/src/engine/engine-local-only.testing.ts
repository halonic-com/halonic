// Fakes for the engine service's Local only tests: a model server that never answers and the page's
// timers.

import type { SetTimer } from "@halonicjs/adapter-scheduler-node";
import type { HttpClient } from "@halonicjs/ports";

/** A model server that takes each call and answers none until it is called off, so a run stays going. */
export const hungServer: HttpClient = {
  fetch: (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    }),
};

/** The page's timers, as the window sets them: a run's next step is one, due at once. */
export const pageTimers: SetTimer = (callback, delayMs) => {
  const timer = setTimeout(callback, delayMs);
  return () => clearTimeout(timer);
};
