/**
 * The services and types other features may use. Features import each other only through this
 * file.
 */
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/**
 * What the account menu shows of the signed-in customer, from the computer's
 * `GET /api/account-menu` (S2-25). The words come from Halonic Cloud's signed session and are
 * shown as text only; no address is ever built from them.
 */
export interface AccountMenuFacts {
  /** The customer's display name, else their email: "Sofia Marin". */
  readonly name: string;
  /** The product's name, for "You've signed out of {Product}": "Acme Agents". */
  readonly productName: string;
  /** The customer's plan, such as "Pro", or `null` with no plan. */
  readonly plan: string | null;
  /** Spent cost over the cost limit, rounded down and at most 100, or `null` with no cost limit. */
  readonly usedPercent: number | null;
  /** The account page (AC-00), as Cloud gave it: an `https:` address. */
  readonly accountUrl: string;
  /** The account page's plan section (AC-00 #plan), as the computer gave it. */
  readonly planUrl: string;
}

/** What the account menu asks the computer that serves the Studio. The app provides it. */
export interface AccountMenuHost {
  /**
   * The signed-in customer's facts, or `null` when this Studio has no account menu: a single-user
   * Studio, or many users without Cloud sign-in. Rejects when the computer can't answer.
   */
  load(): Promise<AccountMenuFacts | null>;
  /** Ends the session here and at Cloud. Rejects when the computer didn't end it. */
  signOut(): Promise<void>;
  /**
   * The product's name once this page has signed out, else `null`. The host outlives the menu,
   * which the window draws again when it changes layout, so the signed-out page stays.
   */
  signedOutOf(): string | null;
  /** Opens an address from the facts, in this tab. */
  open(address: string): void;
  /** Where **Sign in again** goes: the computer's sign-in route. */
  readonly signInAddress: string;
}

/**
 * The served Studio's account menu host. Only a served Studio provides it, so the desktop app
 * shows no account menu.
 */
export const AccountMenuHostService: ServiceKey<AccountMenuHost> =
  serviceKey<AccountMenuHost>("account-menu.host");
