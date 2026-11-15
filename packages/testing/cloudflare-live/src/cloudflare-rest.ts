/** The few Cloudflare REST calls the fixture needs and `CloudflareApi` doesn't offer. */
export interface CloudflareRest {
  /** The id of the D1 database with this name, for the Worker's `d1` binding. */
  d1DatabaseId(accountId: string, name: string): Promise<string>;
  /** The account's workers.dev subdomain, the part before `.workers.dev`. */
  workersSubdomain(accountId: string): Promise<string>;
  /** Writes one R2 object. */
  putObject(accountId: string, bucket: string, key: string, value: string): Promise<void>;
  /** Deletes one R2 object; nothing happens when it is already gone. */
  deleteObject(accountId: string, bucket: string, key: string): Promise<void>;
  /** Deletes every object in the bucket, so the bucket itself can be deleted. */
  emptyBucket(accountId: string, bucket: string): Promise<void>;
}

export interface CloudflareRestOptions {
  /** The API token. Sent as a bearer header only; never logged or put in an error. */
  readonly token: string;
  readonly fetch?: typeof fetch;
  readonly baseUrl?: string;
}

interface Envelope {
  readonly success?: boolean;
  readonly errors?: readonly { readonly message?: string }[];
  readonly result?: unknown;
}

/**
 * The REST calls over `fetch`. An error names the call and Cloudflare's own message, never the token.
 *
 * @example
 * const rest = createCloudflareRest({ token });
 * await rest.putObject(accountId, "hlt-1-1-w-defs", "definitions/current", version);
 */
export function createCloudflareRest(options: CloudflareRestOptions): CloudflareRest {
  const doFetch = options.fetch ?? fetch;
  const base = options.baseUrl ?? "https://api.cloudflare.com/client/v4";

  async function call(
    method: string,
    path: string,
    init: { body?: string; contentType?: string; allow404?: boolean } = {},
  ): Promise<Envelope | undefined> {
    const response = await doFetch(`${base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${options.token}`,
        ...(init.contentType === undefined ? {} : { "content-type": init.contentType }),
      },
      ...(init.body === undefined ? {} : { body: init.body }),
    });
    if (response.status === 404 && init.allow404 === true) return undefined;
    const envelope = (await response.json().catch(() => ({}))) as Envelope;
    if (!response.ok || envelope.success === false) {
      const text = envelope.errors?.map((e) => e.message).join("; ") ?? "";
      const reason = text === "" ? `status ${response.status}` : text;
      // The account id is not a secret, but it stays out of CI logs.
      throw new Error(
        `Cloudflare refused ${method} ${path.replace(/^\/accounts\/[^/?]+/, "/accounts/<account>")}: ${reason}`,
      );
    }
    return envelope;
  }

  const objectPath = (accountId: string, bucket: string, key: string) =>
    `/accounts/${accountId}/r2/buckets/${bucket}/objects/${encodeURIComponent(key)}`;

  return {
    async d1DatabaseId(accountId, name) {
      const envelope = await call(
        "GET",
        `/accounts/${accountId}/d1/database?name=${encodeURIComponent(name)}`,
      );
      const found = (envelope?.result as { uuid?: string; name?: string }[] | undefined)?.find(
        (database) => database.name === name,
      );
      if (found?.uuid === undefined) throw new Error(`The database ${name} does not exist.`);
      return found.uuid;
    },
    async workersSubdomain(accountId) {
      const envelope = await call("GET", `/accounts/${accountId}/workers/subdomain`);
      const subdomain = (envelope?.result as { subdomain?: string } | undefined)?.subdomain;
      if (subdomain === undefined || subdomain === "") {
        throw new Error("The account has no workers.dev subdomain.");
      }
      return subdomain;
    },
    async putObject(accountId, bucket, key, value) {
      await call("PUT", objectPath(accountId, bucket, key), {
        body: value,
        contentType: "application/octet-stream",
      });
    },
    async deleteObject(accountId, bucket, key) {
      await call("DELETE", objectPath(accountId, bucket, key), { allow404: true });
    },
    async emptyBucket(accountId, bucket) {
      // A listing page is at most 1000 keys; each pass deletes what it lists, so stop when it is empty.
      for (let pass = 0; pass < 100; pass++) {
        const envelope = await call("GET", `/accounts/${accountId}/r2/buckets/${bucket}/objects`, {
          allow404: true,
        });
        const keys = ((envelope?.result as { key?: string }[] | undefined) ?? []).flatMap((o) =>
          o.key === undefined ? [] : [o.key],
        );
        if (keys.length === 0) return;
        for (const key of keys) {
          await call("DELETE", objectPath(accountId, bucket, key), { allow404: true });
        }
      }
      throw new Error(`The bucket ${bucket} still has objects after 100 passes.`);
    },
  };
}
