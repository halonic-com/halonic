import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { type LoggedRequest, RequestLogStore } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { requestLogFilesIn } from "./request-log-files.ts";

/** Two workspace keys, as `workspaceFolders` makes them. */
const workspace = "0123456789abcdef0123456789abcdef";
const otherWorkspace = "fedcba9876543210fedcba9876543210";

/** The integration's code: it calls `/v2/orders/<id>` and nothing else. */
// biome-ignore lint/suspicious/noTemplateCurlyInString: the integration's code, as text
const code = "export const order = (id) => http.fetch(`https://shop.example.com/v2/orders/${id}`);";

function request(path: string): LoggedRequest {
  return {
    method: "GET",
    host: "shop.example.com",
    path,
    status: 200,
    durationMs: 5,
    outcome: "ok",
  };
}

verifies("app.integration-request-log", () => {
  describe("RequestLogStore in the profile", () => {
    let root: string;
    let profile: string;
    let workspaceRoot: string;

    beforeEach(async () => {
      root = await mkdtemp(join(tmpdir(), "halonic-request-log-"));
      profile = join(root, "profile");
      workspaceRoot = join(root, "workspace");
    });

    afterEach(async () => {
      await rm(root, { recursive: true, force: true });
    });

    const storeIn = (folder: string, limit?: number) =>
      new RequestLogStore(requestLogFilesIn(folder), limit === undefined ? {} : { limit });
    const paths = async (store: RequestLogStore, integration = "shop") =>
      (await store.lines(workspace, integration)).map((line) =>
        line.type === "request" ? line.path : `failed ${line.tool}`,
      );

    it("keeps entries and failure notes across a restart", async () => {
      await storeIn(profile).addRequest(workspace, "shop", request("/v2/orders"), code);
      await storeIn(profile).addFailure(workspace, "shop", {
        tool: "order",
        kind: "unavailable",
        fields: ["fulfillment.status"],
      });
      const lines = await storeIn(profile).lines(workspace, "shop");
      expect(lines).toMatchObject([
        { type: "request", path: "/v2/orders", status: 200 },
        { type: "failure", tool: "order", kind: "unavailable", fields: ["fulfillment.status"] },
      ]);
    });

    it("keeps only the last requests up to its limit, and the failure notes beside them", async () => {
      const store = storeIn(profile, 2);
      for (const path of ["/v2", "/v2/orders", "/orders"]) {
        await store.addRequest(workspace, "shop", request(path), code);
      }
      await store.addFailure(workspace, "shop", { tool: "order" });
      expect(await paths(store)).toEqual(["/v2/orders", "/orders", "failed order"]);
    });

    it("keeps 200 requests by default", async () => {
      const store = storeIn(profile);
      for (let n = 0; n < 201; n += 1) {
        await store.addRequest(workspace, "shop", request(n === 0 ? "/v2" : "/orders"), code);
      }
      const kept = await paths(store);
      expect(kept).toHaveLength(200);
      expect(kept).not.toContain("/v2");
    });

    it("masks a segment the code doesn't hold, and one of digits even beside a literal one", async () => {
      const store = storeIn(profile);
      await store.addRequest(
        workspace,
        "shop",
        request("/v2/orders/1001/customers/x@example.com"),
        code,
      );
      await store.addRequest(workspace, "shop", request("/v2/orders/1001"), `${code} limit = 1001`);
      expect(await paths(store)).toEqual(["/v2/orders/{…}/{…}/{…}", "/v2/orders/{…}"]);
    });

    it("masks against the code when written: an entry keeps its mask after the code changes", async () => {
      const store = storeIn(profile);
      await store.addRequest(workspace, "shop", request("/v2/orders/1001"), code);
      await store.addRequest(
        workspace,
        "shop",
        request("/v2/orders/1001"),
        `${code} "/v2/orders/1001"`,
      );
      expect(await paths(store)).toEqual(["/v2/orders/{…}", "/v2/orders/1001"]);
    });

    it("stores a failure's field that isn't a plain path as {…}", async () => {
      const store = storeIn(profile);
      await store.addFailure(workspace, "shop", {
        tool: "order",
        fields: ["items[0].sku", "Dear Ada"],
      });
      expect(await store.lines(workspace, "shop")).toMatchObject([
        { fields: ["items[0].sku", "{…}"] },
      ]);
    });

    it.skipIf(process.platform === "win32")(
      "[platform:win32] Windows has no file modes: writes a private file in the profile, outside the workspace",
      async () => {
        await storeIn(profile).addRequest(workspace, "shop", request("/v2"), code);
        const file = join(profile, "integration-logs", workspace, "shop.jsonl");
        expect((await stat(file)).mode & 0o777).toBe(0o600);
        expect(relative(workspaceRoot, file).startsWith("..")).toBe(true);
      },
    );

    it("deletes an integration's log when it is removed, and keeps the others", async () => {
      const store = storeIn(profile);
      await store.addRequest(workspace, "shop", request("/v2"), code);
      await store.addRequest(workspace, "weather", request("/v2"), code);
      await store.removeIntegration(workspace, "shop");
      expect(await store.lines(workspace, "shop")).toEqual([]);
      expect(await readdir(join(profile, "integration-logs", workspace))).toEqual([
        "weather.jsonl",
      ]);
    });

    it("deletes the workspace's whole folder of logs when the workspace is forgotten", async () => {
      const store = storeIn(profile);
      await store.addRequest(workspace, "shop", request("/v2"), code);
      await store.addRequest(otherWorkspace, "shop", request("/v2"), code);
      await store.forgetWorkspace(workspace);
      expect(await readdir(join(profile, "integration-logs"))).toEqual([otherWorkspace]);
    });

    it("refuses a workspace key or integration id that could lead out of its folder", async () => {
      const store = storeIn(profile);
      await expect(store.addRequest("..", "shop", request("/v2"), code)).rejects.toThrow(
        RangeError,
      );
      await expect(store.addRequest(workspace, "../shop", request("/v2"), code)).rejects.toThrow(
        RangeError,
      );
    });
  });
});
