/**
 * What step 7 shows for one service after sign-in (design 3.5, item 7). No
 * kind holds a token or any of Google's free text, so every result is safe
 * to show, to log and to keep in the setup record.
 */
export type ServiceCheckOutcome =
  /** The sheet's `googleCheck` answered with a 2xx status. */
  | { readonly kind: "works" }
  /**
   * Every scope was granted and the sheet has no `googleCheck`. This means
   * "allowed", not "works": nothing showed the API is switched on.
   */
  | { readonly kind: "allowed" }
  /** The user unticked one of the service's scopes, so the check didn't run. */
  | { readonly kind: "scopeNotGranted"; readonly missingScopes: readonly string[] }
  | ApiOff
  /** The check answered with any other status: 401, 429, 5xx and so on. */
  | {
      readonly kind: "checkFailed";
      readonly status: number;
      /** Google's reason code, such as `rateLimitExceeded`, when it sent one in a shape we trust. */
      readonly reason?: string;
    }
  /** The check got no answer: the request failed or timed out. */
  | { readonly kind: "unreachable" };

/**
 * The API is switched off in the user's Google Cloud project. No field is
 * text from Google's answer; a field is missing when we couldn't take it
 * from the sheet, the setup or a project number.
 */
export interface ApiOff {
  readonly kind: "apiOff";
  /** The API's host, such as `example.googleapis.com`, when Google named an API the service's sheet lists. */
  readonly api?: string;
  /** The API's name from the service's sheet. Present when `api` is. */
  readonly apiName?: string;
  /** The project ID from the setup, or else the project number from Google's answer. */
  readonly project?: string;
  /** The API's page in the Console, where its "Enable" button is. Present when `api` is. */
  readonly enableUrl?: string;
}

/** One service's check result, as the sign-in returns it. */
export interface ServiceResult {
  /** The service's id from the setup. */
  readonly service: string;
  readonly result: ServiceCheckOutcome;
  /** When the check ran, from the `Clock`. */
  readonly checkedAt: Date;
}
