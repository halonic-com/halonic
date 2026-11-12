# @halonicjs/adapter-cloudflare-storage

The storage ports over Cloudflare's storage products, for the Worker. Today that is the
`BlobStore` over R2; the D1 record store and the R2 definition store follow
([build plan](https://github.com/halonic-com/halonic) part 2 to 4, HAL-197).

- **Layer:** adapters
- **Owner:** priya
- **Runtime:** workers (it never imports `cloudflare:*` itself: the binding comes in through the constructor)
- **Public API:** `@halonicjs/adapter-cloudflare-storage`

## Use

```ts
import { R2BlobStore } from "@halonicjs/adapter-cloudflare-storage";

// In the Worker, with an R2 bucket bound as BLOBS:
const blobs = new R2BlobStore(env.BLOBS);
const ref = await blobs.put(new TextEncoder().encode("hello"), "text/plain");
await blobs.get(ref.hash); // the bytes
```

- Each blob is the object `blobs/<hash>`, holding only the bytes, with the media type of the put that
  wrote it as `Content-Type`. Pass another prefix to give a store its own place in a shared bucket.
- A put looks for the object first and writes only when it is missing.
- `get` answers `null` for a hash that isn't 64 lowercase hex characters, without calling R2.

## Tests

The `BlobStore` contract runs inside `workerd` over a real R2 binding, through
`@halonicjs/target-cloudflare-testing` (`blob-store.test.ts`). `leftover-a.test.ts` and
`leftover-b.test.ts` start their own `workerd` and must each find an empty bucket, so whichever runs
second shows nothing carries over between test files. `r2-blob-store.test.ts` covers the code in
Node with a small stand-in bucket, because Node's coverage can't see code that runs in `workerd`.
