// Asks Ollama on this computer which models it has downloaded, for the model
// detection in `@halonicjs/app`. Here, so the CLI and Studio's services send
// the same request. Only Ollama, only this computer, at its usual address:
// v0.1 has no way to name another one.

import { type DownloadedModelSource, ollamaDownloadedModels } from "@halonicjs/app";
import type { HttpClient } from "@halonicjs/ports";

/** Where Ollama lists its downloaded models: its own list, with the names `ollama pull` takes. */
export const ollamaTagsUrl = "http://localhost:11434/api/tags";

/**
 * How long Ollama may take to send its whole answer. The model screen waits
 * for it, so it is also the longest an Ollama that hangs keeps it waiting.
 */
export const ollamaAnswerTimeoutMs = 3_000;

/**
 * A {@link DownloadedModelSource} that asks `GET http://localhost:11434/api/tags`.
 * It sends no key, refuses redirects, and gives up when the whole answer,
 * body included, hasn't come within {@link ollamaAnswerTimeoutMs}.
 *
 * @throws from `downloadedModels` when Ollama doesn't answer in time, answers
 *   with an error status, or sends what isn't its list
 *
 * @example
 * const models = await detectLocalModels(ollamaDownloadedModelSource({ fetch }));
 */
export function ollamaDownloadedModelSource(http: HttpClient): DownloadedModelSource {
  return {
    async downloadedModels() {
      // One signal for the request and the body, so a body that never ends times out too.
      const response = await http.fetch(ollamaTagsUrl, {
        redirect: "error",
        signal: AbortSignal.timeout(ollamaAnswerTimeoutMs),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Ollama answered /api/tags with HTTP ${response.status}.`);
      }
      return ollamaDownloadedModels(await response.json());
    },
  };
}
