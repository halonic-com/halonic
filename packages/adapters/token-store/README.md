# @halonicjs/adapter-token-store

The `TokenStore` port over a `RecordStore`: tokens the server writes itself, such as Google
refresh tokens, kept AES-256-GCM-encrypted with Web Crypto only, so it runs in Node and in workerd.

- **Layer:** adapters
- **Owner:** ravi
- **Public API:** `@halonicjs/adapter-token-store`

## Example

Set a token, read it back under another spelling, remove it. The code lives in
[`examples/set-get-remove.ts`](examples/set-get-remove.ts), where it is typechecked and run by
`src/example.test.ts`; keep this copy in step with it. The file imports `../src/index.ts`, because a
package may not import itself by name; outside this package, import
`@halonicjs/adapter-token-store` as below. The example builds its records, key and clock from the
memory adapter; on a server, `records` is a store agents can't write to, `secrets` reads the
configured `token-key` and `clock` is `{ now: () => new Date() }`. It never prints a token or a key.

```ts
import { ManualClock, MemoryRecordStore, MemorySecrets } from "@halonicjs/adapter-memory";
import { encodeBase64url } from "@halonicjs/std";
import { createTokenStore, tokenCollection, tokenKeySecret } from "@halonicjs/adapter-token-store";

/** Sets a token, reads it back under another spelling, removes it, and never returns the token. */
export async function runExample(): Promise<{
  readBack: boolean;
  storedAsPlainText: boolean;
  afterRemove: string | null;
}> {
  // The records, the key and the clock are all passed in. Here they are in memory; on a server
  // `records` is a store agents can't write to and `secrets` reads the configured `token-key`.
  const records = new MemoryRecordStore();
  const key = encodeBase64url(crypto.getRandomValues(new Uint8Array(32))); // 32 random bytes
  const secrets = new MemorySecrets({ [tokenKeySecret]: key });
  const clock = new ManualClock("2026-11-09T07:00:00.000Z");

  const tokens = createTokenStore({ records, secrets, clock });
  const refreshToken = "example-refresh-token"; // a made-up value; never print a real one

  await tokens.set("google-refresh", refreshToken);

  // Case and `-` versus `_` don't matter: both spellings name the same token.
  const readBack = (await tokens.get("Google_Refresh")) === refreshToken; // true

  // The record store holds the sealed value, not the token.
  const stored = JSON.stringify(await records.changes(tokenCollection));
  const storedAsPlainText = stored.includes(refreshToken); // false

  await tokens.remove("google-refresh");
  const afterRemove = await tokens.get("google-refresh"); // null

  return { readBack, storedAsPlainText, afterRemove };
}
```

## The key

The key is the configured secret `token-key`: 32 random bytes in base64url, without padding. Under
the environment adapter it is `STUDIO_SECRET_TOKEN_KEY`. One way to make one:

```sh
node -e "console.log(crypto.getRandomValues(Buffer.alloc(32)).toString('base64url'))"
```

The key is read the first time a token has to be sealed or opened, so a server that never stores a
token needs none. A missing or wrong key is not remembered: set the secret and the next call uses it.

## Stored format

Each token is one record in the collection `_tokens`, under its canonical name (lower case, `-`
turned into `_`), with one value `sealed`: base64url of

| bytes | content                                                                  |
| ----- | ------------------------------------------------------------------------ |
| 1     | format version, `0x01`                                                   |
| 4     | key id: the first 4 bytes of SHA-256 of `"halonic-token-key-id\0"` + key |
| 12    | random nonce, new on every `set`                                         |
| rest  | AES-256-GCM ciphertext with its 16-byte tag                              |

The additional data is `halonic-token-v1:` + the canonical name + the version byte and key id, so
a value copied to another name won't open. A value that won't open throws `UnreadableTokenError`,
never `null`, so a key mix-up never looks like "not signed in". Its kind is `unauthenticated`:
the user has to connect again.

## Limits

- **`records` must be a store agents and tools can't write to.** Anyone who can append to it can
  remove a token or roll it back to an older sealed value, which the encryption doesn't prevent.
  `_tokens` can't be a workspace collection id, so a hub can't reach it by listing a collection.
- **Old values leave the record store, not the disk blocks.** After a replace or a remove the
  store calls `RecordStore.compact("_tokens")`, so the old sealed value is no longer in the log.
  Backups, copies and freed disk blocks are outside the record store and may still hold it.
- **One key at a time.** A value sealed with another key throws. The key id lets a later version
  open values with a previous key and re-seal them, without a new format.
