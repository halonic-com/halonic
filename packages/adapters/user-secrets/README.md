# @halonicjs/adapter-user-secrets

End users' own secrets, such as a token for their repositories, sealed with envelope encryption
through Web Crypto: each end user has a data key, which the deployment's key-encryption key
(the secret `user-secrets-key`) wraps.

- **Layer:** adapters
- **Owner:** mateo
- **Runtime:** any
- **Public API:** `@halonicjs/adapter-user-secrets`

## How it seals

- A data key is 32 random bytes, used as a non-extractable AES-256-GCM key and stored only
  wrapped: `uk1.<key-encryption key id>.<version>.<sealed key>`.
- A secret is `us1.<data key version>.<sealed value>`.
- AES-GCM's additional data binds a wrapped data key to its end user, version and
  key-encryption key, and a secret to its end user, its name and the data key's version, so
  neither opens when copied to another user or name.
- Every seal takes a new random 96-bit nonce. That is safe here: one data key seals one
  person's secrets, far below the 2^32 messages per key that random nonces allow.

The storage is trusted to keep values current. It could hand back an older sealed value of the
same name for the same user, or drop one, and AES-GCM can't tell: envelope encryption protects
what the values say, not whether they are the newest.

This package only seals and keeps values. Where the storage lives and which run step may
read a secret are the caller's job.

## Example

```ts
const kek = await loadKeyEncryptionKey(secrets);
const own = new UserSecrets(kek, "eu_acme", new MemoryUserSecretStorage());
await own.set("github-token", token);
await own.get("github-token"); // the token
await own.names(); // ["GITHUB_TOKEN"]
```
