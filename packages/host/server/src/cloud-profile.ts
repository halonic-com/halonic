/**
 * What Halonic Cloud signs into a session token about its customer and the product (S2-25), so
 * the account menu shows them without asking Cloud. The words are shown as text only, and the
 * address is used as Cloud gave it; nothing builds an address from a name.
 */
export interface CloudProfile {
  /** The customer's display name, else their email: the `name` claim. */
  readonly name: string;
  /** The product's account page on Cloud's account host, `https:`: the `account` claim. */
  readonly account: string;
  /** The product's name: the `product_name` claim. */
  readonly productName: string;
}

/** What {@link checkCloudProfile} found: a profile, none at all, or claims that are wrong. */
export type CloudProfileCheck =
  | { readonly ok: true; readonly profile: CloudProfile | null }
  | { readonly ok: false };

/** The longest name or product name accepted, in characters, as Cloud cuts them. */
const maxWordsLength = 200;

/**
 * Checks the `name`, `account` and `product_name` claims. A token with none of the three has no
 * profile, as Cloud issued before it signed them; one with only some of them, or any of them
 * wrong, is refused. `account` must parse as a URL, be `https:` and carry no user or password;
 * `name` and `product_name` must be strings of at most 200 characters.
 *
 * @param read reads one claim's own value, `undefined` when it is missing
 */
export function checkCloudProfile(read: (name: string) => unknown): CloudProfileCheck {
  const name = read("name");
  const account = read("account");
  const productName = read("product_name");
  if (name === undefined && account === undefined && productName === undefined) {
    return { ok: true, profile: null };
  }
  if (!isShortText(name) || !isShortText(productName) || !isAccountAddress(account)) {
    return { ok: false };
  }
  return { ok: true, profile: Object.freeze({ name, account, productName }) };
}

/** A string of at most 200 characters, counted as Unicode code points. */
function isShortText(value: unknown): value is string {
  // Two UTF-16 units per character at most, so a longer string is never walked.
  if (typeof value !== "string" || value.length > maxWordsLength * 2) {
    return false;
  }
  return [...value].length <= maxWordsLength;
}

/** An `https:` address with no user or password. */
function isAccountAddress(value: unknown): value is string {
  if (typeof value !== "string" || !URL.canParse(value)) {
    return false;
  }
  const url = new URL(value);
  return url.protocol === "https:" && url.username === "" && url.password === "";
}
