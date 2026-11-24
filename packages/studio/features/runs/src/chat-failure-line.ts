// A chat's failed model call in the run page's own sentences (microcopy 14.1 "Model unreachable",
// 22 F7, F8), so a chat and a run say the same thing. The facts are `chatFailureOf`'s; a chat
// sends the person back with "then try again." instead of "then run again.".

import { isModelAlias, type RunFailure } from "@halonicjs/app/run-failure";
import { failureWords } from "./failure-words.ts";
import { providerNameOf } from "./provider-name.ts";

/**
 * The provider's own sentence for a chat's failed model call: F7 for a model it couldn't reach,
 * by where the model runs, and F8 for a local model that didn't fit in memory. Both end in
 * Models, so the chat offers **Open Models ›** with them.
 *
 * @returns `undefined` for any other failure, which the chat says in its own words
 *
 * @example
 * chatFailureLine({ reason: "model-unreachable", provider: "Ollama", address: "localhost:11434", alias: "fast", local: true });
 * // "Halonic couldn't reach Ollama at localhost:11434 for the model alias fast. Ollama may not be running on this computer. Start Ollama, then try again."
 */
export function chatFailureLine(failure: RunFailure): string | undefined {
  switch (failure.reason) {
    case "model-unreachable": {
      const provider = providerNameOf(failure.provider, undefined);
      // `chatFailureOf` names a model no alias points at as `<provider>/<model>`.
      const named = isModelAlias(failure.alias);
      const model = named ? failure.alias : failure.alias.slice(failure.alias.indexOf("/") + 1);
      const alias = named ? failure.alias : undefined;
      if (failure.address === "") {
        return failureWords.modelAddressWithoutHost(provider, model, alias);
      }
      const sentence = failure.local
        ? failureWords.localModelUnreachable
        : failureWords.cloudModelUnreachable;
      return sentence(provider, failure.address, model, alias, "try again");
    }
    case "model-out-of-memory": {
      const provider = providerNameOf(failure.provider, undefined);
      const line = failureWords.modelOutOfMemory(provider, failure.model);
      return `${line} ${failureWords.modelOutOfMemoryFix}`;
    }
    default:
      return undefined;
  }
}
