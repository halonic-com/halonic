/**
 * Studio asks a person "Allow this address?" for a run's model call
 * (requirement `events.key-origin-asked`): the call's provider would send a
 * stored key to an address that isn't on that key's list, and the run waits
 * for the answer. `provider`, `key` and `origin` as in
 * `key-origin.answered`; never the key's value. A `key-origin.answered`
 * follows when the person answers; a wait that ends without an answer adds
 * nothing, and the call fails with the refusal.
 */
export interface KeyOriginAskedEvent {
  type: "key-origin.asked";
  provider: string;
  key: string;
  origin: string;
}
