import { mkdir, mkdtemp, readdir, readFile, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProfilePlatform } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { HostRunInstructions } from "./host-instructions.ts";
import { instructionRoutes } from "./instruction-routes.ts";

const token = randomLaunchToken();

function profilePlatformOf(platform: NodeJS.Platform): ProfilePlatform {
  if (platform === "win32") return "windows";
  return platform === "darwin" ? "macos" : "linux";
}

let root: string;
let workspace: string;
let instructions: HostRunInstructions;
let server: HostServer | undefined;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "halonic-instruction-route-")));
  workspace = join(root, "acme");
  await mkdir(workspace);
  instructions = new HostRunInstructions({
    profile: { platform: profilePlatformOf(process.platform), root: join(root, "data") },
    workspaceRoots: [workspace],
  });
  server = await startHostServer(token, instructionRoutes(instructions));
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  await rm(root, { recursive: true, force: true });
});

async function ask(route: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${server?.url}/v1/harnesses/${route}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

const files = [
  { name: "AGENTS.md", text: "Be brief.\n" },
  { name: "skills/review/SKILL.md", text: "Review the change.\n" },
];

async function opened(): Promise<{ folder: string; pin: { digest: string } }> {
  const answer = await ask("instructions", { workspace, files });
  expect(answer.status).toBe(200);
  return answer.body as { folder: string; pin: { digest: string } };
}

verifies("agent-host.instruction-routes", () => {
  it("makes a folder in the data folder with the files, and pins them", async () => {
    const { folder, pin } = await opened();
    expect(folder.startsWith(join(root, "data"))).toBe(true);
    expect(await readFile(join(folder, "AGENTS.md"), "utf8")).toBe("Be brief.\n");
    expect(await readFile(join(folder, "skills", "review", "SKILL.md"), "utf8")).toBe(
      "Review the change.\n",
    );
    expect(pin.digest).toMatch(/^sha256:/u);
  });

  it("removes a folder it made on release, and leaves any other path alone", async () => {
    const { folder } = await opened();
    const other = join(root, "keep");
    await mkdir(other);
    expect((await ask("instructions/release", { folder: other })).status).toBe(200);
    expect((await stat(other)).isDirectory()).toBe(true);
    expect((await ask("instructions/release", { folder })).status).toBe(200);
    await expect(stat(folder)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("removes every folder it made when the host stops", async () => {
    const { folder } = await opened();
    await instructions.stop();
    await expect(stat(folder)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("clears what a host that stopped left, before its first folder", async () => {
    const left = (await opened()).folder;
    const next = new HostRunInstructions({
      profile: { platform: profilePlatformOf(process.platform), root: join(root, "data") },
      workspaceRoots: [workspace],
    });
    const made = await next.open(workspace, files);
    await expect(stat(left)).rejects.toMatchObject({ code: "ENOENT" });
    expect(made?.folder).not.toBe(left);
  });

  it("answers 404 for a folder the launcher did not name, and makes nothing", async () => {
    const other = join(root, "other");
    await mkdir(other);
    expect((await ask("instructions", { workspace: other, files })).status).toBe(404);
    await expect(readdir(join(root, "data"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("answers 422 instructions_refused for a name a harness may not load", async () => {
    const answer = await ask("instructions", {
      workspace,
      files: [{ name: "../escape.md", text: "x" }],
    });
    expect(answer.status).toBe(422);
    expect(answer.body).toMatchObject({ error: { kind: "instructions_refused" } });
  });

  it("answers 400 for a body with a field it does not know, or no files", async () => {
    expect((await ask("instructions", { workspace, files, extra: 1 })).status).toBe(400);
    expect((await ask("instructions", { workspace, files: [] })).status).toBe(400);
  });
});
