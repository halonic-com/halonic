import type { GoogleApi, GoogleCheck, SetupService } from "./setup-input.ts";

/** The part of a workspace connector the subject lookup reads. */
export interface SubjectConnector {
  readonly id: string;
  /** The connector's transport: one object with one key, such as `google`. */
  readonly transport: object;
}

/** The part of a local integration's permission sheet the services come from. */
export interface SubjectIntegration {
  readonly sheet: {
    readonly id: string;
    readonly googleApis?: readonly GoogleApi[] | undefined;
    readonly googleScopes?:
      | readonly {
          readonly scope: string;
          readonly reason: string;
          readonly restricted?: boolean | undefined;
        }[]
      | undefined;
    readonly googleCheck?: GoogleCheck | undefined;
  };
}

/** Who a Google sign-in must confirm, and what it asks for. */
export type SetupSubject =
  | {
      readonly kind: "found";
      /** The connector's address. Personal data: never printed or logged. */
      readonly address: string;
      /** The services that ask for Google scopes. Empty when none does. */
      readonly services: readonly SetupService[];
    }
  | { readonly kind: "noConnector" }
  | { readonly kind: "notGoogle" };

/**
 * Finds who a Google sign-in must confirm: the address of the workspace's
 * connector with this id, and the services of the integrations that ask for
 * Google scopes. One rule for every host, so the page never says whose
 * address Google must confirm.
 *
 * @example
 * googleSetupSubject(connectors, integrations, "gmail");
 * // { kind: "found", address: "someone@example.com", services: [...] }
 */
export function googleSetupSubject(
  connectors: readonly SubjectConnector[],
  integrations: readonly SubjectIntegration[],
  connectorId: string,
): SetupSubject {
  const connector = connectors.find((candidate) => candidate.id === connectorId);
  if (connector === undefined) {
    return { kind: "noConnector" };
  }
  const address = googleAddress(connector.transport);
  if (address === undefined) {
    return { kind: "notGoogle" };
  }
  return { kind: "found", address, services: googleServices(integrations) };
}

/** The address of a `google` transport, or `undefined` for any other transport. */
function googleAddress(transport: object): string | undefined {
  if (!("google" in transport)) {
    return undefined;
  }
  const { google } = transport;
  if (typeof google !== "object" || google === null || !("account" in google)) {
    return undefined;
  }
  return typeof google.account === "string" ? google.account : undefined;
}

/** Every integration that asks for Google scopes, as the setup's services. */
function googleServices(integrations: readonly SubjectIntegration[]): SetupService[] {
  return integrations.flatMap(({ sheet }) => {
    const scopes = sheet.googleScopes ?? [];
    if (scopes.length === 0) {
      return [];
    }
    return [
      {
        id: sheet.id,
        label: sheet.id,
        googleApis: sheet.googleApis ?? [],
        googleScopes: scopes.map(({ scope, reason, restricted }) => ({
          scope,
          reason,
          ...(restricted === undefined ? {} : { restricted }),
        })),
        ...(sheet.googleCheck === undefined ? {} : { googleCheck: sheet.googleCheck }),
      },
    ];
  });
}
