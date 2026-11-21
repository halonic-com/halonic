/**
 * A person answered Studio's "Allow this address?" for a run's model call
 * (requirement `events.key-origin-answered`): the call's provider would send
 * a stored key to an address that isn't on that key's list. `provider`: the
 * provider's name as the workspace gives it. `key`: the stored key's name,
 * never its value. `origin`: the address, as `https://host` with a port only
 * when it isn't the scheme's default. `answer`: `allowed` when the person
 * added the address to the key's list, `not-allowed` when they refused.
 * A wait that ended without an answer (the run was stopped, or it timed out)
 * writes none.
 */
export interface KeyOriginAnsweredEvent {
  type: "key-origin.answered";
  provider: string;
  key: string;
  origin: string;
  answer: "allowed" | "not-allowed";
}
