# @halonicjs/adapter-token-store

The `TokenStore` port over a `RecordStore`: tokens the server writes itself, such as Google
refresh tokens, kept AES-256-GCM-encrypted with Web Crypto only, so it runs in Node and in workerd.

- **Layer:** adapters
- **Owner:** ravi
- **Public API:** `@halonicjs/adapter-token-store`

## Example

```ts
import { createTokenStore } from "@halonicjs/adapter-token-store";

const tokens = createTokenStore({ records, secrets, clock });
await tokens.set("google-refresh", refreshToken);
await tokens.get("Google_Refresh"); // the same token: case and - versus _ don't matter
await tokens.remove("google-refresh");
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
never `null`, so a key mix-up never looks like "not signed in".

## Limits

- **`records` must be a store agents and tools can't write to.** Anyone who can append to it can
  remove a token or roll it back to an older sealed value, which the encryption doesn't prevent.
  `_tokens` can't be a workspace collection id, so a hub can't reach it by listing a collection.
- **Old values stay in the log.** The record store only appends, so a replaced or removed token
  stays in its history, encrypted. If the key leaked, old tokens could be read too. Removing them
  for good needs a compaction step on the `RecordStore` port, which is a separate change with its
  own ADR.
- **One key at a time.** A value sealed with another key throws. The key id lets a later version
  open values with a previous key and re-seal them, without a new format.
