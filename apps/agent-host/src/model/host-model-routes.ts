import { EnvSecrets, firstSecret } from "@halonicjs/adapter-env-secrets";
import { createNodeHttpClient } from "@halonicjs/adapter-http-node";
import { mockFactory } from "@halonicjs/adapter-model-mock";
import { openAiFactories } from "@halonicjs/adapter-model-openai";
import { FileSecretStore } from "@halonicjs/adapter-secrets-file";
import { type Secrets, workspaceSecrets } from "@halonicjs/ports";
import { type ProfileFolder, secretsFile } from "@halonicjs/profile";
import type { ModelRouteDeps } from "./model-routes.ts";

/** What the host builds the model route from. */
export interface HostModelOptions {
  /** The folders the launcher named as workspaces. */
  workspaceRoots: readonly string[];
  /** The profile folder, whose secrets file holds provider keys; `undefined` without one. */
  profile: ProfileFolder | undefined;
  /** The host's own environment, where `HALONIC_SECRET_<NAME>` may hold a key. */
  env: Readonly<Record<string, string | undefined>>;
  log?: (text: string) => void;
}

/**
 * What the model route works with: the OpenAI-compatible providers (OpenAI,
 * Ollama, LM Studio and servers that copy them) and the test model, called
 * through a client that reaches this computer's own addresses only. A key is
 * read from the environment, then from the profile's secrets file, as the
 * CLI reads them, and only through `workspaceSecrets`, so a provider file
 * can't name one of Halonic's own secrets. The OS keychain Studio's Models page saves to is
 * not read here, so a local provider that needs a key reads it from these two.
 */
export function hostModelRoutes(options: HostModelOptions): ModelRouteDeps {
  return {
    workspaceRoots: options.workspaceRoots,
    factories: [...openAiFactories, mockFactory],
    secrets: workspaceSecrets(providerKeys(options)),
    http: createNodeHttpClient({ hostClass: () => "loopback" }),
    ...(options.log === undefined ? {} : { log: options.log }),
  };
}

function providerKeys({ env, profile }: HostModelOptions): Secrets {
  if (profile === undefined) return new EnvSecrets(env);
  let file: FileSecretStore | undefined;
  return firstSecret(new EnvSecrets(env), {
    get: (name) => {
      file ??= new FileSecretStore(secretsFile(profile));
      return file.get(name);
    },
  });
}
