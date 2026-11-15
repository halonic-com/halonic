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
      const reason =
        envelope.errors?.map((e) => e.message).join("; ") ?? `status ${response.status}`;
      throw new Error(`Cloudflare refused ${method} ${path}: ${reason}`);
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
  };
}
