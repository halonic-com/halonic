// The person's own model from Settings › Assistant, for a Build chat in a workspace that isn't
// trusted (flow-assistant 5.9, HAL-720, HAL-17335). Everything about it comes from the device's
// settings, never from a workspace file: no alias, no provider file, no fallbacks.

import type { ResolvedModel } from "@halonicjs/engine";
import {
  type ChatAgentSettings,
  type HttpClient,
  isHalonicSecretName,
  isPluginSecretName,
  isSecretName,
  type KeyOrigins,
  type Secrets,
} from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { isOnThisMachine } from "@halonicjs/workspace";
import { modelTexts } from "./model-texts.ts";
import { requireKeyMayGo, resolvedModel } from "./workspace-model-resolver.ts";
import {
  type ProviderFile,
  WorkspaceModelError,
  workspaceProvider,
} from "./workspace-providers.ts";

/** What {@link deviceModel} reads besides the settings. */
export interface DeviceModelContext {
  readonly secrets: Secrets;
  readonly http: HttpClient;
  readonly keyOrigins: KeyOrigins;
  /** The workspace's `privacy.localOnly`: it can only narrow which models are called. */
  readonly localOnly: boolean;
}

/**
 * The model of the Settings › Assistant settings. The address is the person's own, so it may be
 * any address, but a key with a list of allowed origins still goes only to an origin on it
 * (`requireKeyMayGo`). In a local-only workspace only an address on this computer is called, and
 * the settings' `local` flag isn't trusted for that: the address decides.
 *
 * @throws KindedError `denied` for a secret name that is Halonic's own or a plugin's
 * @throws {WorkspaceModelError} `not-on-this-machine` in a local-only workspace, or what
 *   `requireKeyMayGo` throws
 */
export async function deviceModel(
  settings: ChatAgentSettings,
  context: DeviceModelContext,
): Promise<ResolvedModel> {
  const secret = settings.secret;
  if (
    secret !== undefined &&
    (!isSecretName(secret) || isHalonicSecretName(secret) || isPluginSecretName(secret))
  ) {
    throw new KindedError("denied", "The assistant's key can't be one of Halonic's own secrets.");
  }
  if (context.localOnly && !isOnThisMachine({ ...settings, options: {} })) {
    throw new WorkspaceModelError(
      "not-on-this-machine",
      modelTexts.notOnThisMachine(settings.model),
      modelTexts.notOnThisMachineFix(),
    );
  }
  const file: ProviderFile = {
    id: settings.type,
    type: settings.type,
    local: settings.local,
    options: {},
    ...(settings.baseUrl === undefined ? {} : { baseUrl: settings.baseUrl }),
    ...(secret === undefined ? {} : { secret }),
  };
  // `trusted`: the address is the person's own setting, which no workspace file can change.
  await requireKeyMayGo(file, { trusted: true, keyOrigins: context.keyOrigins });
  return resolvedModel(workspaceProvider(file, context), file, {
    provider: file.id,
    model: settings.model,
    params: {},
  });
}
