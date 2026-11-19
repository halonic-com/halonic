// Asks Ollama on this computer which models it has downloaded, for the model
// detection in `@halonicjs/app`. Here, so the CLI and Studio's services send
// the same request. Only Ollama, only this computer, at its usual address:
// v0.1 has no way to name another one.
//
// It gives the answer unread: `@halonicjs/app` reads the list. Importing
// `@halonicjs/app` here would put it in the fenced integration runner's file,
// which bundles this package and may import nothing but Node's own modules.

import type { HttpClient } from "@halonicjs/ports";

/** Where Ollama lists its downloaded models: its own list, with the names `ollama pull` takes. */
export const ollamaTagsUrl = "http://localhost:11434/api/tags";

/**
 * How long Ollama may take to send its whole answer. The model screen waits
 * for it, so it is also the longest an Ollama that hangs keeps it waiting.
 */
export const ollamaAnswerTimeoutMs = 3_000;

/**
 * Asks `GET http://localhost:11434/api/tags` and gives Ollama's answer as
 * parsed JSON. It sends no key, refuses redirects, and gives up when the
 * whole answer, body included, hasn't come within {@link ollamaAnswerTimeoutMs}.
 *
 * @throws when Ollama doesn't answer in time, answers with an error status,
 *   or sends what isn't JSON
 *
 * @example
 * await detectLocalModels(ollamaDownloadedModelSource(() => readOllamaTags({ fetch })));
 */
export async function readOllamaTags(http: HttpClient): Promise<unknown> {
  // One signal for the request and the body, so a body that never ends times out too.
  const response = await http.fetch(ollamaTagsUrl, {
    redirect: "error",
    signal: AbortSignal.timeout(ollamaAnswerTimeoutMs),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Ollama answered /api/tags with HTTP ${response.status}.`);
  }
  return response.json();
}
