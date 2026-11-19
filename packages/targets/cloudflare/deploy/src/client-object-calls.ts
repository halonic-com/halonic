import type { CloudflareApi } from "./api.ts";
import type { DeployError } from "./errors.ts";

/** What the object calls borrow from the client: sending one request and naming a failure. */
export interface ObjectPlumbing {
  send(method: "PUT", path: string, json: undefined, body: Blob): Promise<Response>;
  failed(message: string): DeployError;
}

/** The R2 object writes a deploy makes: the definitions snapshot. */
export function objectCalls(plumbing: ObjectPlumbing): Pick<CloudflareApi, "putObject"> {
  const { send, failed } = plumbing;
  return {
    async putObject(accountId, bucket, key, value) {
      const path = `/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucket)}/objects/${encodeURIComponent(key)}`;
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
  };
}
