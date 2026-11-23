import type { CloudflareApi } from "./api.ts";
import type { DeployError } from "./errors.ts";

/** What the object calls borrow from the client: sending one request and naming a failure. */
export interface ObjectPlumbing {
  send(method: "PUT" | "GET", path: string, json?: undefined, body?: Blob): Promise<Response>;
  failed(message: string): DeployError;
}

/** The R2 object calls a deploy makes: the definitions snapshot and each version's record. */
export function objectCalls(
  plumbing: ObjectPlumbing,
): Pick<CloudflareApi, "putObject" | "getObject"> {
  const { send, failed } = plumbing;
  const pathOf = (accountId: string, bucket: string, key: string) =>
    `/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucket)}/objects/${encodeURIComponent(key)}`;
  return {
    async putObject(accountId, bucket, key, value) {
      const path = pathOf(accountId, bucket, key);
      const bytes = typeof value === "string" ? value : new Uint8Array(value);
      const response = await send(
        "PUT",
        path,
        undefined,
        new Blob([bytes], { type: "application/octet-stream" }),
      );
      // R2's object write doesn't always answer with an envelope, so only an explicit refusal counts.
      const body = (await response.json().catch(() => ({}))) as { success?: unknown };
      if (!response.ok || body.success === false) {
        throw failed(`PUT ${path} was refused (HTTP ${response.status})`);
      }
    },
    async getObject(accountId, bucket, key) {
      const path = pathOf(accountId, bucket, key);
      const response = await send("GET", path);
      if (response.status === 404) return undefined;
      if (!response.ok) throw failed(`GET ${path} was refused (HTTP ${response.status})`);
      // An object read answers with the object's bytes, not an envelope.
      return response.text();
    },
  };
}
