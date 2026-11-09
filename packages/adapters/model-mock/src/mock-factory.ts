import type { LlmProvider, LlmProviderFactory, ProviderConfig } from "@halonicjs/ports";
import { isPlainObject } from "@halonicjs/std";
import { MockLlmProvider, mockProviderType } from "./mock-provider.ts";
import type { MockScript } from "./script.ts";

/**
 * Makes the mock model for a provider of `type: mock` in a workspace. Its
 * `options.script` is a {@link MockScript}; without one, every agent gets its
 * last message echoed back.
 *
 * @example
 * // providers/mock.yaml
 * // id: mock
 * // type: mock
 * // options:
 * //   script:
 * //     writer: [Hello]
 */
export const mockFactory: LlmProviderFactory = {
  type: mockProviderType,
  create(config: ProviderConfig): LlmProvider {
    return new MockLlmProvider(config.id, readScript(config));
  },
};

/**
 * The script in a provider's options.
 *
 * @throws when `options.script` is there but isn't a map from agent id to a list of replies
 */
function readScript(config: ProviderConfig): MockScript {
  const script: unknown = config.options["script"];
  if (script === undefined) {
    return {};
  }
  if (!isPlainObject(script)) {
    throw new Error(
      `Provider "${config.id}": options.script must map agent ids to lists of replies.`,
    );
  }
  const replies: Record<string, readonly string[]> = {};
  for (const [agentId, list] of Object.entries(script)) {
    if (!Array.isArray(list) || !list.every((reply) => typeof reply === "string")) {
      throw new Error(
        `Provider "${config.id}": options.script.${agentId} must be a list of replies (text).`,
      );
    }
    replies[agentId] = list;
  }
  return replies;
}
