import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileSystemFolderReader, FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { webCryptoDigest } from "@halonicjs/adapter-fs-tauri";
import { MemoryTrustStore } from "@halonicjs/adapter-memory";
import { type TrustCheck, TrustService } from "@halonicjs/app";
import { fixedClock } from "@halonicjs/std";
import type { UnfencedRunStatus } from "@halonicjs/studio-feature-plugins/api";
import { verifies } from "@halonicjs/testing-spec";
import type { IntegrationTrustContent } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  type IntegrationRuns,
  integrationRunsChecking,
  integrationRunsFenced,
  integrationRunsOff,
  integrationsIntro,
} from "./integration-trust-rows.ts";
import { trustReviewOf } from "./trust-review.ts";
import { WorkspaceTrust } from "./workspace-trust.ts";
import { integrationRunsOf, WorkspaceTrustView } from "./workspace-trust-control.ts";

const station: IntegrationTrustContent = {
  id: "home-station",
  folder: "integrations/home-station",
  provides: ["connector"],
  hosts: { "api.weather.example": "public", "‹setting url›": "private" },
  secrets: [
    {
      secret: "‹secret station-token›",
      hosts: ["‹setting url›"],
      placement: { as: "bearer" },
      optional: false,
    },
  ],
  googleScopes: [],
  tools: { "read-sensors": { risk: "read", untrusted: false } },
  needs: [],
  code: "sha256:1",
  addresses: { url: "http://192.168.1.20:8123/" },
};

function checkOf(integrations: IntegrationTrustContent[]): TrustCheck {
  return {
    status: "new",
    fingerprint: "hfp1:1",
    unpinned: [],
    content: { connectors: [], integrations },
  } as unknown as TrustCheck;
}

function reviewOf(runs: IntegrationRuns, integrations = [station]) {
  const review = trustReviewOf(checkOf(integrations), {
    name: "Acme",
    folder: "/work/acme",
    runs,
  });
  const section = review?.sections.find((each) => each.heading.startsWith("Integrations"));
  return { review, section, row: section?.rows[0] };
}

verifies("studio.workspace-trust-integrations", () => {
  it("lists a local integration in its own section, with Folder, Runs, Reaches and Gets secrets", () => {
    const { review, section, row } = reviewOf({ state: "fenced" });

    // Each line under Reaches is an address: the fixed host and the setting's.
    expect(review?.summary).toEqual(["Will run 1 integration and list 2 addresses."]);
    expect(review?.sections.map((each) => each.heading)).toEqual(["Integrations (1)"]);
    expect(section?.intro).toBe(integrationsIntro);
    expect(section?.open).toBe(false);
    expect(row?.id).toBe("home-station");
    expect(row?.lines).toEqual([
      ["Folder", "integrations/home-station/"],
      ["Runs", integrationRunsFenced],
      ["Reaches", "api.weather.example"],
      [
        "",
        "http://192.168.1.20:8123/ (from the workspace's settings for home-station: url · only on your home network)",
      ],
      ["Gets secrets", "station-token → http://192.168.1.20:8123/"],
    ]);
  });

  it("says an integration doesn't start where the sandbox can't, with the reason and fix, and no yes", () => {
    const { review, section, row } = reviewOf({ state: "not-fenced", reason: "container" });

    expect(section?.open).toBe(true);
    // The summary doesn't say it will run what Runs says doesn't start.
    expect(review?.summary).toEqual(["Will list 2 addresses."]);
    expect(row?.lines[1]).toEqual(["Runs", integrationRunsOff]);
    expect(row?.lines[2]?.[1]).toMatch(/container/);
    expect(row?.lines[3]?.[0]).toBe("");
    // Nothing to confirm: no checkbox, so Trust doesn't wait on one.
    expect(review?.unpinned).toEqual([]);
  });

  it("names Windows for the reason windows, in the integration's words", () => {
    const { row } = reviewOf({ state: "not-fenced", reason: "windows" });

    expect(row?.lines.slice(1, 4)).toEqual([
      ["Runs", integrationRunsOff],
      ["", "On Windows, integration code can't run in the sandbox in this version of Halonic."],
      ["", "Use Halonic inside WSL 2 on this computer."],
    ]);
  });

  it("says it's checking while the host answers, and leaves Runs out when the host can't say", () => {
    expect(reviewOf({ state: "checking" }).row?.lines[1]).toEqual([
      "Runs",
      integrationRunsChecking,
    ]);
    expect(reviewOf(undefined).row?.lines.map(([label]) => label)).toEqual([
      "Folder",
      "Reaches",
      "",
      "Gets secrets",
    ]);
  });

  it("says a setting isn't set yet, with its class", () => {
    const { row } = reviewOf({ state: "fenced" }, [
      { ...station, addresses: { url: null }, secrets: [] },
    ]);

    expect(row?.lines).toContainEqual([
      "",
      "Not set yet, in the workspace's settings for home-station · only on your home network",
    ]);
  });

  it("gives a sheet that calls itself built-in the full check, because only the loader's source says built-in", () => {
    // A workspace folder can name its integration like Halonic's own; it is still local code.
    const claims = { ...station, id: "gmail", folder: "integrations/gmail" };
    const { section, row } = reviewOf({ state: "fenced" }, [claims]);

    expect(section?.heading).toBe("Integrations (1)");
    expect(row?.lines.map(([label]) => label)).toContain("Runs");
    expect(JSON.stringify(section)).not.toMatch(/built-in/i);
  });

  it("reads a saved yes as not starting, since nothing starts a local integration without the sandbox", () => {
    expect(
      integrationRunsOf({ run: "allowed", reason: "windows", allowedAt: "2026-11-09T10:00:00Z" }),
    ).toEqual({ state: "not-fenced", reason: "windows" });
    expect(integrationRunsOf({ run: "needs-yes", reason: "container" })).toEqual({
      state: "not-fenced",
      reason: "container",
    });
    expect(integrationRunsOf({ run: "fenced" })).toEqual({ state: "fenced" });
    expect(integrationRunsOf({ run: "stopped" })).toBeUndefined();
    expect(integrationRunsOf({ run: "needs-yes", reason: "from-a-newer-host" })).toBeUndefined();
  });
});

const sheet = `id: radar
version: 0.3.0
kit: 1
provides: [connector]
hosts: [radar.example.com]
tools:
  - { name: radar-map, description: The rain radar., risk: read, untrusted: true }
`;

let folder: string;

beforeEach(async () => {
  folder = await realpath(await mkdtemp(join(tmpdir(), "halonic-trust-integrations-")));
  await mkdir(join(folder, "integrations/radar/src"), { recursive: true });
  await writeFile(join(folder, "workspace.yaml"), "id: acme\nname: Acme\n");
  await writeFile(join(folder, "integrations/radar/integration.yaml"), sheet);
  await writeFile(join(folder, "integrations/radar/src/index.js"), "export default {};\n");
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

async function viewWith(status: (() => Promise<UnfencedRunStatus>) | undefined) {
  const trust = new WorkspaceTrust({
    definitions: new FolderDefinitionStore(folder, folder),
    folder: new FileSystemFolderReader(folder, folder),
    findCommand: async () => undefined,
    digest: webCryptoDigest,
    trust: new TrustService({
      store: new MemoryTrustStore(),
      digest: webCryptoDigest,
      clock: fixedClock(),
      appVersion: "0.1.0",
    }),
  });
  await trust.refresh();
  return new WorkspaceTrustView(trust, "/work/acme", status);
}

function runsOf(view: WorkspaceTrustView): string | undefined {
  const section = view.review()?.sections.find((each) => each.heading.startsWith("Integrations"));
  return section?.rows[0]?.lines.find(([label]) => label === "Runs")?.[1];
}

verifies("studio.workspace-trust-integrations", () => {
  it("asks the host when the check opens, says Checking until it answers, then its answer", async () => {
    let answer: (status: UnfencedRunStatus) => void = () => undefined;
    const view = await viewWith(() => new Promise((resolve) => (answer = resolve)));
    const changes: number[] = [];
    view.subscribe(() => changes.push(changes.length));

    expect(runsOf(view)).toBeUndefined();
    view.checkRuns();
    expect(runsOf(view)).toBe(integrationRunsChecking);

    answer({ run: "fenced" });
    await Promise.resolve();
    expect(runsOf(view)).toBe(integrationRunsFenced);
    expect(changes.length).toBe(2);
  });

  it("drops an answer to an older ask, and leaves Runs out when the host fails", async () => {
    const answers: ((status: UnfencedRunStatus) => void)[] = [];
    let fail = false;
    const view = await viewWith(() =>
      fail
        ? Promise.reject(new Error("the host is gone"))
        : new Promise((resolve) => answers.push(resolve)),
    );

    view.checkRuns();
    view.checkRuns();
    answers[1]?.({ run: "fenced" });
    answers[0]?.({ run: "needs-yes", reason: "container" });
    await Promise.resolve();
    expect(runsOf(view)).toBe(integrationRunsFenced);

    fail = true;
    view.checkRuns();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(runsOf(view)).toBeUndefined();
  });
});
