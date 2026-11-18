import { mkdir, mkdtemp, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { FileAgentPlacementStore } from "@halonicjs/adapter-fs-node";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { HostPlacements } from "./host-placements.ts";
import { placementRoutes } from "./placement-routes.ts";

const token = randomLaunchToken();

let root: string;
let workspace: string;
let placementsFolder: string;
let server: HostServer | undefined;

const choice = () => ({
  location: workspace,
  agent: "coder",
  runsOn: "this-computer",
  agentFingerprint: "sha256:abc",
  chosenAt: "2026-11-18T10:00:00.000Z",
});

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "halonic-placement-route-")));
  workspace = join(root, "acme");
  await mkdir(workspace);
  placementsFolder = join(root, "data", "placements");
  const placements = new HostPlacements(new FileAgentPlacementStore(placementsFolder), [workspace]);
  server = await startHostServer(token, placementRoutes(placements));
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  await rm(root, { recursive: true, force: true });
});

async function ask(route: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${server?.url}/v1/placements/${route}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

verifies("agent-host.placement-routes", () => {
  it("answers none, then a saved choice, then none again after it is removed", async () => {
    const key = { location: workspace, agent: "coder" };
    expect((await ask("get", key)).body).toEqual({ placement: null });
    expect((await ask("save", choice())).status).toBe(200);
    expect((await ask("get", key)).body).toEqual({ placement: choice() });
    expect((await ask("remove", key)).status).toBe(200);
    expect((await ask("get", key)).body).toEqual({ placement: null });
  });

  it("answers 404 for a location the launcher did not name, and writes nothing", async () => {
    const other = join(root, "other");
    await mkdir(other);
    const key = { location: other, agent: "coder" };
    expect((await ask("get", key)).status).toBe(404);
    expect((await ask("save", { ...choice(), location: other })).status).toBe(404);
    expect((await ask("remove", key)).status).toBe(404);
    await expect(readdir(placementsFolder)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("answers 404 for a path that reaches a named workspace by another name", async () => {
    const key = { location: `${workspace}${sep}..${sep}acme`, agent: "coder" };
    expect((await ask("get", key)).status).toBe(404);
  });

  it("answers 422 placement_unreadable for a damaged choice, never none", async () => {
    await ask("save", choice());
    const [file] = await readdir(placementsFolder);
    await writeFile(join(placementsFolder, file as string), "{ not json");
    const answer = await ask("get", { location: workspace, agent: "coder" });
    expect(answer.status).toBe(422);
    expect(answer.body).toMatchObject({ error: { kind: "placement_unreadable" } });
  });

  it("refuses a choice that is not this-computer, or has a field it does not know", async () => {
    expect((await ask("save", { ...choice(), runsOn: "elsewhere" })).status).toBe(400);
    expect((await ask("save", { ...choice(), sandbox: false })).status).toBe(400);
  });
});
