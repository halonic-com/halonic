import type { SetupService } from "@halonicjs/google-setup";
import type { LocalIntegrationInput } from "@halonicjs/workspace";

/**
 * Every local integration that asks for Google scopes, as the setup's services, in the order of
 * their folders. The fields are the sheet's own (`googleApis`, `googleScopes`, `googleCheck`), so
 * no second list of services exists; the CLI's `google sign-in` builds the same list.
 */
export function googleServices(integrations: readonly LocalIntegrationInput[]): SetupService[] {
  return integrations.flatMap(({ sheet }) => {
    const scopes = sheet.googleScopes ?? [];
    if (scopes.length === 0) return [];
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
