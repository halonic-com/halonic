import { parse, s } from "@halonicjs/schema-kit";
import type { AccountMenuFacts, AccountMenuHost } from "@halonicjs/studio-feature-account-menu/api";
import type { PageFetch } from "../runs/served-inbox-runs.ts";

/** Where the computer answers the account menu (S2-25 PR 3). */
const accountMenuPath = "/api/account-menu";
/** Where the computer ends a Cloud session and clears its cookies. */
const signOutPath = "/api/sign-out";
/** Where the computer starts a Cloud sign-in. */
const signInPath = "/api/sign-in";

/** `GET /api/account-menu`'s answer: exactly these six fields. */
const answerSchema = s
  .object({
    name: s.string(),
    productName: s.string(),
    plan: s.union([s.string(), s.null()]),
    usedPercent: s.union([s.number(), s.null()]),
    accountUrl: s.string(),
    planUrl: s.string(),
  })
  .strict();

/**
 * The account menu of a served window (`studio.served-account-menu`): it asks the computer
 * running Halonic, on the page's own address and session, for the signed-in customer, and signs
 * out there. A 404 means this Studio has no account menu. Any other refusal, or an answer that
 * isn't the six fields with two `https:` addresses, rejects, so no menu shows half-known facts.
 */
export class ServedAccountMenu implements AccountMenuHost {
  readonly signInAddress = signInPath;
  readonly #fetch: PageFetch;
  readonly #open: (address: string) => void;
  /** The product's name from the last answer, kept for the signed-out page. */
  #productName: string | null = null;
  #signedOut = false;

  /**
   * @param fetchPage reads and posts a path on the page's own address
   * @param openPage opens an address in the page's tab
   */
  constructor(fetchPage: PageFetch, openPage: (address: string) => void) {
    this.#fetch = fetchPage;
    this.#open = openPage;
  }

  async load(): Promise<AccountMenuFacts | null> {
    const response = await this.#fetch(accountMenuPath);
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`The computer answered ${response.status} to GET ${accountMenuPath}.`);
    }
    const answer = parse(answerSchema, await response.json());
    const addressesOk =
      answer.ok &&
      isAccountAddress(answer.value.accountUrl) &&
      isAccountAddress(answer.value.planUrl);
    if (!answer.ok || !addressesOk) {
      throw new Error(`The computer's ${accountMenuPath} answer isn't an account menu.`);
    }
    this.#productName = answer.value.productName;
    return answer.value;
  }

  async signOut(): Promise<void> {
    const response = await this.#fetch(signOutPath, { method: "POST" });
    if (!response.ok) {
      throw new Error(`The computer answered ${response.status} to POST ${signOutPath}.`);
    }
    this.#signedOut = true;
  }

  signedOutOf(): string | null {
    return this.#signedOut ? this.#productName : null;
  }

  open(address: string): void {
    this.#open(address);
  }
}

/**
 * Whether an address is one the menu may open: `https:` with no user or password, as the server
 * checks Cloud's claim. The page checks again, so a wrong answer never becomes a link.
 */
function isAccountAddress(address: string): boolean {
  if (!URL.canParse(address)) {
    return false;
  }
  const url = new URL(address);
  return url.protocol === "https:" && url.username === "" && url.password === "";
}
