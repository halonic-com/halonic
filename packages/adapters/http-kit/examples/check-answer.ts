import { addressAllowedFor, classifyAddress } from "../src/index.ts";

/** Checks a DNS answer for a public host the way the Node transport does: every address, not only the first. */
export function runExample(): { allowed: string[]; refused: { address: string; class: string }[] } {
  // An answer that mixes a public address with a private and a mapped loopback one.
  const answer = ["93.184.215.14", "10.0.0.5", "::ffff:127.0.0.1"];

  const allowed = answer.filter((address) => addressAllowedFor("public", address));
  const refused = answer
    .filter((address) => !addressAllowedFor("public", address))
    .map((address) => ({ address, class: classifyAddress(address) }));

  // allowed: ["93.184.215.14"]
  // refused: 10.0.0.5 is "private", ::ffff:127.0.0.1 is "reserved"
  return { allowed, refused };
}
