// AES-256-GCM under a fresh random 96-bit nonce, with the context as additional data.
//
// Random nonces are fine at our volume: one data key seals only one person's secrets,
// and the key-encryption key wraps one data key per person, both far below the
// 2^32 messages per key NIST SP 800-38D allows for random nonces.

const nonceLength = 12;
const tagLength = 16;
const encoder = new TextEncoder();

/** Bytes as Web Crypto takes them in the Worker's types too. */
export type Bytes = Uint8Array<ArrayBuffer>;

/**
 * What a sealed value is bound to. It becomes the additional data, so a value
 * sealed for one context won't open in another. JSON keeps the fields apart:
 * `["a", "b:c"]` and `["a:b", "c"]` are different data.
 */
export type SealContext = readonly (string | number)[];

/** Encrypts `plain` under `key`, bound to `context`. Gives the nonce, then the ciphertext and its tag. */
export async function seal(key: CryptoKey, context: SealContext, plain: Bytes): Promise<Bytes> {
  const nonce = crypto.getRandomValues(new Uint8Array(nonceLength));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: additionalData(context) },
    key,
    plain,
  );
  const sealed = new Uint8Array(nonceLength + ciphertext.byteLength);
  sealed.set(nonce);
  sealed.set(new Uint8Array(ciphertext), nonceLength);
  return sealed;
}

/**
 * Decrypts what {@link seal} gave, for the same key and context.
 *
 * @param unreadable makes the error to throw when the value is too short, was
 *   changed, or was sealed with another key or for another context
 */
export async function open(
  key: CryptoKey,
  context: SealContext,
  sealed: Bytes,
  unreadable: (cause?: unknown) => Error,
): Promise<Bytes> {
  if (sealed.length < nonceLength + tagLength) {
    throw unreadable();
  }
  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: sealed.subarray(0, nonceLength),
        additionalData: additionalData(context),
      },
      key,
      sealed.subarray(nonceLength),
    );
    return new Uint8Array(plain);
  } catch (error) {
    throw unreadable(error);
  }
}

function additionalData(context: SealContext): Bytes {
  return encoder.encode(JSON.stringify(context));
}
