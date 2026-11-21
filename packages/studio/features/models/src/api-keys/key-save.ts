import type { SecretText } from "@halonicjs/studio-kit";
import type { AllowAddressResult, KeyAddresses, ModelKeys } from "../api.ts";

/** The reason in a failed save's line, after "Couldn't save the key:". */
const refusalWords = {
  "no-key": "no key is stored under this name",
  full: "the key can't take more addresses",
  "bad-address": "the address can't be kept",
} as const;

/** Why an address wasn't kept, when the key store answered instead of failing. */
export class AddressRefused extends Error {
  readonly answer: Exclude<AllowAddressResult, { result: "added" | "already-allowed" }>;

  constructor(answer: AddressRefused["answer"]) {
    super(refusalWords[answer.result]);
    this.name = "AddressRefused";
    this.answer = answer;
  }
}

/** What one Save stores: a new key, an address for the key, or both. At least one is set. */
export interface KeySave {
  readonly key?: SecretText | undefined;
  readonly address?: string | undefined;
}

/**
 * Stores a key and the address it may go to, so that a failure leaves things as they were where
 * it can. The keychain keeps addresses only beside a stored key, so:
 *
 * - With a key stored, the address is added first and the new key after it. A new key keeps the
 *   addresses (`studio.src-tauri.crates.secrets.key-origins`).
 * - With none stored (the store answers `no-key`), the key is stored, then the address. If the
 *   address isn't kept, the new key is removed again, so it never stands without an address.
 *
 * @returns the address as it is kept, when one was saved
 * @throws AddressRefused when the store answers `full` or `bad-address`; anything the store throws
 */
export async function saveKey(
  keys: Pick<ModelKeys, "save" | "remove">,
  addresses: KeyAddresses | undefined,
  secretName: string,
  { key, address }: KeySave,
): Promise<string | undefined> {
  if (address === undefined || addresses === undefined) {
    if (key !== undefined) await keys.save(secretName, key);
    return undefined;
  }
  const first = await addresses.allow(secretName, address);
  if (first.result !== "no-key") {
    const kept = keptAddress(first);
    if (key !== undefined) await keys.save(secretName, key);
    return kept;
  }
  if (key === undefined) throw new AddressRefused(first);
  await keys.save(secretName, key);
  try {
    return keptAddress(await addresses.allow(secretName, address));
  } catch (error) {
    await keys.remove(secretName);
    throw error;
  }
}

function keptAddress(answer: AllowAddressResult): string {
  switch (answer.result) {
    case "added":
    case "already-allowed":
      return answer.origin;
    default:
      throw new AddressRefused(answer);
  }
}
