import type { WorkspaceSecretWriter } from "@halonicjs/ports";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/**
 * Where Studio keeps a connector's secrets, the store the agent host's connector reads them from:
 * the keychain, through `workspaceSecretWriter`, so a connector can't name Halonic's own secrets
 * or a plugin's. `has` says only whether a value is stored, so the page never receives one.
 * Only the desktop app provides it; without it the connector page has no secret fields (HAL-14995).
 */
export type ConnectorSecrets = WorkspaceSecretWriter;

/** The key of {@link ConnectorSecrets}. */
export const ConnectorSecretsService: ServiceKey<ConnectorSecrets> = serviceKey<ConnectorSecrets>(
  "library.connector-secrets",
);
