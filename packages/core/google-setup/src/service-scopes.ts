import type { SetupService } from "./setup-input.ts";

/**
 * Whether Google granted every scope one service needs. On Google's consent
 * screen the user can untick scopes, so one service can be ready while
 * another isn't.
 */
export type ServiceScopes =
  | { readonly service: string; readonly granted: true }
  | {
      readonly service: string;
      readonly granted: false;
      readonly missingScopes: readonly string[];
    };

/**
 * Google's long names for the short sign-in scopes a sheet may list. Google
 * asks for `email` and `profile` but reports them back as these URLs.
 */
const longScopeNames: ReadonlyMap<string, string> = new Map([
  ["email", "https://www.googleapis.com/auth/userinfo.email"],
  ["profile", "https://www.googleapis.com/auth/userinfo.profile"],
]);

/**
 * Compares the scopes Google granted with each service's `googleScopes`, in
 * the order the services come. A service counts as granted only when every
 * one of its scopes was granted; a service that needs no scope always is.
 *
 * @param services - the ticked services
 * @param grantedScopes - the scopes from Google's token answer
 * @returns one entry per service, with the missing scopes in sheet order
 */
export function serviceScopes(
  services: readonly SetupService[],
  grantedScopes: readonly string[],
): ServiceScopes[] {
  const granted = new Set(grantedScopes);
  return services.map((service) => {
    const missingScopes = uniqueScopes(service).filter((scope) => !wasGranted(scope, granted));
    if (missingScopes.length === 0) {
      return { service: service.id, granted: true };
    }
    return { service: service.id, granted: false, missingScopes };
  });
}

/** Whether Google granted the scope, under its own name or, for a short sign-in scope, its long one. */
function wasGranted(scope: string, granted: ReadonlySet<string>): boolean {
  const longName = longScopeNames.get(scope);
  return granted.has(scope) || (longName !== undefined && granted.has(longName));
}

/** The service's scopes, each once, in sheet order. */
function uniqueScopes(service: SetupService): string[] {
  return [...new Set(service.googleScopes.map(({ scope }) => scope))];
}
