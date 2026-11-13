/** Letters, digits and `*-._`: what `application/x-www-form-urlencoded` leaves as it is. */
const plainCharacters = /[A-Za-z0-9*\-._]/;

/**
 * The text as one form component: every character other than letters,
 * digits and `*-._` as percent-encoded UTF-8, and a space as `+`, the same
 * as `URLSearchParams` writes it. The core has no `URLSearchParams` value,
 * so the form body is written here.
 */
export function encodeFormComponent(text: string): string {
  return Array.from(text, (character) => {
    if (character === " ") return "+";
    if (plainCharacters.test(character)) return character;
    return encodeURIComponent(character).replace(
      /[!'()~]/g,
      (unreserved) => `%${unreserved.charCodeAt(0).toString(16).toUpperCase()}`,
    );
  }).join("");
}

/**
 * Writes the fields as a form body (`application/x-www-form-urlencoded`), in
 * the order the object has them.
 *
 * @param form - the field names and values
 * @returns the body, such as `grant_type=refresh_token&scope=a+b`
 * @throws URIError when a name or value holds a lone surrogate, which has no UTF-8 form
 */
export function formBody(form: Readonly<Record<string, string>>): string {
  return Object.entries(form)
    .map(([name, value]) => `${encodeFormComponent(name)}=${encodeFormComponent(value)}`)
    .join("&");
}
