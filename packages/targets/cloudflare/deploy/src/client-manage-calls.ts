import type {
  CloudflareApi,
  DeployedVersion,
  ListedResource,
  ResourceKind,
  VersionInfo,
} from "./api.ts";
import { DeployError } from "./errors.ts";

/** What the calls below borrow from the client: its request plumbing. */
export interface ClientPlumbing {
  get(path: string): Promise<{
    readonly result?: unknown;
    readonly result_info?: { readonly cursor?: unknown };
  }>;
  request(
    method: "GET" | "DELETE",
    path: string,
    json?: unknown,
    allowMissing?: boolean,
  ): Promise<{ readonly result?: unknown } | undefined>;
  failed(message: string): DeployError;
  workerPath(accountId: string, worker: string): string;
  databaseId(accountId: string, name: string): Promise<string | undefined>;
}

const maxPages = 100;
const listPageSize = 100;

/** The read and delete calls `status`, `rollback`, `destroy` and the sweeper use. */
export function manageCalls(
  plumbing: ClientPlumbing,
): Pick<
  CloudflareApi,
  | "currentDeployment"
  | "deploymentHistory"
  | "versionInfo"
  | "workersDevUrl"
  | "listResources"
  | "deleteResource"
> & { workersDevAddress(accountId: string, worker: string): Promise<string> } {
  const { get, request, failed, workerPath, databaseId } = plumbing;

  /** The Worker's deployments, newest first, each as its versions. */
  async function deployments(
    accountId: string,
    worker: string,
  ): Promise<readonly (readonly DeployedVersion[])[]> {
    const body = await request(
      "GET",
      `${workerPath(accountId, worker)}/deployments`,
      undefined,
      true,
    );
    const list = (body?.result as { deployments?: { versions?: unknown }[] } | undefined)
      ?.deployments;
    if (!Array.isArray(list)) return [];
    return list.flatMap((deployment) =>
      Array.isArray(deployment.versions)
        ? [
            (deployment.versions as { version_id?: unknown; percentage?: unknown }[]).flatMap(
              (v) =>
                typeof v.version_id === "string" && typeof v.percentage === "number"
                  ? [{ id: v.version_id, percentage: v.percentage }]
                  : [],
            ),
          ]
        : [],
    );
  }

  async function workersDevAddress(accountId: string, worker: string): Promise<string> {
    const body = await get(`/accounts/${encodeURIComponent(accountId)}/workers/subdomain`);
    const subdomain = (body.result as { subdomain?: unknown } | undefined)?.subdomain;
    if (typeof subdomain !== "string" || subdomain === "") {
      throw failed("the account has no workers.dev subdomain");
    }
    return `https://${worker}.${subdomain}.workers.dev`;
  }

  /**
   * One page of names and creation times. `next` says how to ask for the page after it: a page
   * number for D1, a cursor for R2 (which ignores `page`), or nothing on the last page.
   */
  async function listPage(
    accountId: string,
    kind: ResourceKind,
    prefix: string,
    after: string | undefined,
  ): Promise<{ rows: { name: unknown; created: unknown }[]; next: string | undefined }> {
    const account = encodeURIComponent(accountId);
    const name = encodeURIComponent(prefix);
    if (kind === "worker") {
      const body = await get(`/accounts/${account}/workers/scripts`);
      return { rows: asRows(body.result, "id", "created_on"), next: undefined };
    }
    if (kind === "database") {
      const page = Number(after ?? "1");
      const body = await get(
        `/accounts/${account}/d1/database?name=${name}&per_page=${listPageSize}&page=${page}`,
      );
      const rows = asRows(body.result, "name", "created_at");
      return { rows, next: rows.length === listPageSize ? String(page + 1) : undefined };
    }
    const cursor = after === undefined ? "" : `&cursor=${encodeURIComponent(after)}`;
    const body = await get(
      `/accounts/${account}/r2/buckets?name_contains=${name}&per_page=${listPageSize}${cursor}`,
    );
    const buckets = (body.result as { buckets?: unknown } | undefined)?.buckets;
    const rows = asRows(buckets, "name", "creation_date");
    const next = body.result_info?.cursor;
    return {
      rows,
      next:
        rows.length === listPageSize && typeof next === "string" && next !== "" ? next : undefined,
    };
  }

  async function listResources(
    accountId: string,
    kind: ResourceKind,
    prefix: string,
  ): Promise<readonly ListedResource[]> {
    const found = new Map<string, ListedResource>();
    let after: string | undefined;
    for (let page = 1; page <= maxPages; page += 1) {
      const { rows, next } = await listPage(accountId, kind, prefix, after);
      for (const { name, created } of rows) {
        const at = Date.parse(String(created));
        if (typeof name === "string" && name.startsWith(prefix) && !Number.isNaN(at)) {
          found.set(name, { kind, name, createdAt: at });
        }
      }
      if (next === undefined || next === after) break;
      after = next;
    }
    return [...found.values()];
  }

  async function deleteBucket(accountId: string, name: string): Promise<void> {
    const path = `/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(name)}`;
    try {
      await request("DELETE", path, undefined, true);
    } catch (error) {
      if (error instanceof DeployError && /not empty/i.test(error.message)) {
        throw new DeployError(
          "bucket-not-empty",
          `Bucket ${name} still holds files, and Cloudflare only deletes an empty bucket. Empty it in the Cloudflare dashboard, then run this again.`,
        );
      }
      throw error;
    }
  }

  return {
    workersDevAddress,
    async currentDeployment(accountId, worker) {
      const history = await deployments(accountId, worker);
      // Cloudflare lists the newest deployment first.
      return history[0];
    },
    async deploymentHistory(accountId, worker) {
      return deployments(accountId, worker);
    },
    async versionInfo(accountId, worker, versionId) {
      const body = await request(
        "GET",
        `${workerPath(accountId, worker)}/versions/${encodeURIComponent(versionId)}`,
        undefined,
        true,
      );
      if (!body) return undefined;
      const result = body.result as
        | {
            annotations?: Record<string, unknown>;
            metadata?: { created_on?: unknown };
          }
        | undefined;
      const message = result?.annotations?.["workers/message"];
      const created = Date.parse(String(result?.metadata?.created_on));
      return {
        id: versionId,
        ...(typeof message === "string" ? { message } : {}),
        ...(Number.isNaN(created) ? {} : { createdAt: created }),
      } satisfies VersionInfo;
    },
    async workersDevUrl(accountId, worker) {
      const settings = await request(
        "GET",
        `${workerPath(accountId, worker)}/subdomain`,
        undefined,
        true,
      );
      const enabled = (settings?.result as { enabled?: unknown } | undefined)?.enabled;
      if (enabled !== true) return undefined;
      return workersDevAddress(accountId, worker);
    },
    async listResources(accountId, kind, prefix) {
      return listResources(accountId, kind, prefix);
    },
    async deleteResource(accountId, ref) {
      if (ref.kind === "bucket") return deleteBucket(accountId, ref.name);
      if (ref.kind === "worker") {
        // `force` also removes a Worker that Durable Objects or other Workers still point at.
        await request("DELETE", `${workerPath(accountId, ref.name)}?force=true`, undefined, true);
        return;
      }
      const id = await databaseId(accountId, ref.name);
      if (!id) return;
      const account = encodeURIComponent(accountId);
      await request("DELETE", `/accounts/${account}/d1/database/${encodeURIComponent(id)}`);
    },
  };
}

function asRows(
  result: unknown,
  nameField: string,
  createdField: string,
): { name: unknown; created: unknown }[] {
  if (!Array.isArray(result)) return [];
  return (result as Record<string, unknown>[]).map((row) => ({
    name: row[nameField],
    created: row[createdField],
  }));
}
