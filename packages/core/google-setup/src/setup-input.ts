import type { AccountType } from "./account-type.ts";

/**
 * How Halonic reaches Google. For now there is one route: the user's own
 * Google app, used on this computer (design 2.1). It's a union with one
 * member, so adding a route is a type change the compiler walks through.
 */
export type SetupRoute = { readonly app: "own"; readonly runsOn: "this-computer" };

/** One `googleScopes` entry of an integration sheet. */
export interface GoogleScope {
  /** The full scope URL, as the sheet writes it. */
  readonly scope: string;
  /** Why the service needs it, shown to the user as it is. */
  readonly reason: string;
  /** Whether Google calls the scope restricted. Missing means no. */
  readonly restricted?: boolean;
}

/** One `googleApis` entry of an integration sheet. */
export interface GoogleApi {
  /** The API host, such as `example.googleapis.com`. */
  readonly api: string;
  /** Google's name for the API, shown to the user as it is. */
  readonly name: string;
}

/** A sheet's `googleCheck`: the one read that shows the API is switched on. */
export interface GoogleCheck {
  readonly method: "GET";
  readonly url: string;
}

/** A service the user ticked, with the Google fields of its sheet. */
export interface SetupService {
  /** The service's id, unique within the setup. */
  readonly id: string;
  /** The name Studio already shows for the service. */
  readonly label: string;
  readonly googleApis: readonly GoogleApi[];
  readonly googleScopes: readonly GoogleScope[];
  readonly googleCheck?: GoogleCheck;
}

/**
 * How a personal account's app is published (design 3.2): `testing`, the
 * default, where the account is listed as a test user and Google ends the
 * sign-in every 7 days, or `production`, with the user's own home page and
 * privacy policy. A Workspace app is Internal and has neither.
 */
export type PersonalPublishing = "testing" | "production";

/** What the setup steps are generated from (design 3.2). */
export interface SetupInput {
  readonly route: SetupRoute;
  readonly accountType: AccountType;
  /** The Google account's address: the default support and contact e-mail. */
  readonly account: string;
  /** The project ID the user pasted in step 1, if any. */
  readonly projectId?: string;
  /** The ticked services, in the order Studio shows them. */
  readonly services: readonly SetupService[];
  /** How a personal account's app is published. Default `testing`; a Workspace account ignores it. */
  readonly publishing?: PersonalPublishing;
  /**
   * True when a personal account uses another account's app in *Testing*:
   * step 3 then only adds this address as a test user (design 3.6).
   */
  readonly sharedApp?: boolean;
  /**
   * Whether step 4 (scopes) is part of the setup (D4). By default it is,
   * except for a personal app in *Testing*, where Google grants the scopes at
   * sign-in (design 3.2, "Step 4 only where it may be needed").
   */
  readonly listScopes?: boolean;
}
