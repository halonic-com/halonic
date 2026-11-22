import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileSystemFolderReader, FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { webCryptoDigest } from "@halonicjs/adapter-fs-tauri";
import { MemoryTrustStore } from "@halonicjs/adapter-memory";
import { type RunnerUnfencedReason, type TrustCheck, TrustService } from "@halonicjs/app";
import { fixedClock } from "@halonicjs/std";
import type { PluginUnfencedRuns, UnfencedRunStatus } from "@halonicjs/studio-feature-plugins/api";
import { verifies } from "@halonicjs/testing-spec";
import type { IntegrationTrustContent } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  type IntegrationRuns,
  integrationRunsChecking,
  integrationRunsFenced,
  integrationRunsUnfenced,
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

  it("says an integration isn't in the sandbox, in amber, with the reason and fix, and opens the section", () => {
    const { review, section, row } = reviewOf({ state: "not-fenced", reason: "container" });

    expect(section?.open).toBe(true);
    expect(section?.mark).toBe("warning");
    expect(row?.flag).toBe("not in the sandbox");
    // With the person's yes it runs, so the summary counts it.
    expect(review?.summary).toEqual(["Will run 1 integration and list 2 addresses."]);
    expect(row?.lines[1]).toEqual(["Runs", integrationRunsUnfenced, "warning"]);
    expect(row?.lines[2]?.[1]).toMatch(/container/);
    expect(row?.lines[3]?.[0]).toBe("");
  });

  it("names Windows for the reason windows, in the integration's words", () => {
    const { row } = reviewOf({ state: "not-fenced", reason: "windows" });

    expect(row?.lines.slice(1, 4)).toEqual([
      ["Runs", integrationRunsUnfenced, "warning"],
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

  it("reads a saved yes as not in the sandbox with its day, as the plugin check reads it", () => {
    const now = new Date("2026-11-21T10:00:00Z");
    expect(
      integrationRunsOf(
        { run: "allowed", reason: "windows", allowedAt: "2026-11-09T10:00:00Z" },
        now,
      ),
    ).toEqual({ state: "not-fenced", reason: "windows", allowedOn: "9 Nov" });
    expect(integrationRunsOf({ run: "needs-yes", reason: "container" })).toEqual({
      state: "not-fenced",
      reason: "container",
      allowedOn: undefined,
    });
    // A yes with no readable day leaves the row out, as in the plugin check.
    expect(
      integrationRunsOf({ run: "allowed", reason: "windows", allowedAt: "not a date" }, now),
    ).toBeUndefined();
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

function viewWith(status: (() => Promise<UnfencedRunStatus>) | undefined) {
  return viewWithRuns(status === undefined ? undefined : { status, allow: async () => null });
}

async function viewWithRuns(runs: PluginUnfencedRuns | undefined) {
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
  return new WorkspaceTrustView(trust, "/work/acme", runs);
}

/** Lets the host's answers arrive. */
function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
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

verifies("studio.workspace-trust-integrations-amber", () => {
  it("puts Runs in amber with the triangle where it isn't in the sandbox, and only Runs", () => {
    const { row } = reviewOf({ state: "not-fenced", reason: "container" });

    expect(row?.lines.filter((line) => line[2] !== undefined)).toEqual([
      ["Runs", integrationRunsUnfenced, "warning"],
    ]);
    expect(reviewOf({ state: "fenced" }).row?.lines.some((line) => line[2] !== undefined)).toBe(
      false,
    );
  });
});

/** A host that says the sandbox can't start here, and records each yes it's asked to save. */
function hostWith(answer: { reason: string; allowedAt: string } | null | Error) {
  const allowed: string[] = [];
  let status: UnfencedRunStatus = { run: "needs-yes", reason: "container" };
  return {
    allowed,
    runs: {
      status: async () => status,
      allow: async (reason: RunnerUnfencedReason) => {
        allowed.push(reason);
        if (answer instanceof Error) throw answer;
        if (answer !== null) status = { run: "allowed", ...answer };
        return answer;
      },
    },
  };
}

verifies("studio.workspace-trust-integrations", () => {
  it("asks for the yes where integration code can't run in the sandbox, and saves it before trust", async () => {
    const host = hostWith({ reason: "container", allowedAt: "2026-11-21T09:00:00Z" });
    const view = await viewWithRuns(host.runs);
    view.checkRuns();
    await settled();

    const review = view.review();
    expect(review?.unfencedYes).toEqual({
      reason: "container",
      checkbox: "I understand plugins and integrations run without the sandbox on this computer",
      reasonLine: "Halonic is running inside a container, and the sandbox can't start there.",
    });

    const result = await view.grant(review?.fingerprint ?? "", true);

    expect(result).toEqual({ ok: true });
    expect(host.allowed).toEqual(["container"]);
    expect(view.status).toBe("trusted");
  });

  it("shows R6 in place of the checkbox once the yes for this reason is saved", async () => {
    const host = hostWith(null);
    host.runs.status = async () => ({
      run: "allowed",
      reason: "container",
      allowedAt: new Date().toISOString(),
    });
    const view = await viewWithRuns(host.runs);
    view.checkRuns();
    await settled();

    const review = view.review();
    const row = review?.sections.find((each) => each.heading.startsWith("Integrations"))?.rows[0];
    expect(review?.unfencedYes).toBeUndefined();
    // Under the reason and fix, where the checkbox would be.
    expect(row?.lines[4]?.[1]).toMatch(
      /^You allowed plugins and integrations to run without the sandbox on this computer on \d+ \w+, for this reason\.$/,
    );
  });

  it("trusts nothing and reads the status again when the reason changed under the yes", async () => {
    const host = hostWith(null);
    let reads = 0;
    const view = await viewWithRuns({
      ...host.runs,
      status: async () => {
        reads += 1;
        return reads === 1
          ? { run: "needs-yes", reason: "container" }
          : { run: "needs-yes", reason: "windows" };
      },
    });
    view.checkRuns();
    await settled();

    const result = await view.grant(view.review()?.fingerprint ?? "", true);
    await settled();

    expect(result).toMatchObject({ ok: false, checkAgain: true });
    expect(view.status).toBe("not-trusted");
    // The check shows the reason that holds now, with the box to tick again.
    expect(view.review()?.unfencedYes?.reason).toBe("windows");
    expect(view.review()?.unfencedYes?.reasonLine).toBe(
      "On Windows, integration code can't run in the sandbox in this version of Halonic.",
    );
  });

  it("trusts nothing when the host couldn't save the yes", async () => {
    const host = hostWith(Object.assign(new Error("disk full"), { kind: "allow_failed" }));
    const view = await viewWithRuns(host.runs);
    view.checkRuns();
    await settled();

    const result = await view.grant(view.review()?.fingerprint ?? "", true);

    expect(result).toMatchObject({
      ok: false,
      reason: "Halonic couldn't save your yes to run plugins and integrations without the sandbox",
    });
    expect(view.status).toBe("not-trusted");
  });

  it("words another failure to save the yes as the shell does, not the host's raw answer", async () => {
    const raw = "agent host: POST /v1/unfenced/allow answered 500";
    const host = hostWith(Object.assign(new Error(raw), { kind: "internal" }));
    const view = await viewWithRuns(host.runs);
    view.checkRuns();
    await settled();

    const result = await view.grant(view.review()?.fingerprint ?? "", true);

    // C665-53: the reason after "Couldn't save trust:" never names the host, a route or a code.
    expect(result).toMatchObject({
      ok: false,
      reason: "Halonic ran into a problem it can't explain yet.",
    });
    expect(view.status).toBe("not-trusted");
  });

  it("saves no yes without the tick, nor in the sandbox", async () => {
    const host = hostWith({ reason: "container", allowedAt: "2026-11-21T09:00:00Z" });
    const view = await viewWithRuns(host.runs);
    view.checkRuns();
    await settled();

    expect(await view.grant(view.review()?.fingerprint ?? "", false)).toEqual({ ok: true });
    expect(host.allowed).toEqual([]);

    const fenced = hostWith({ reason: "container", allowedAt: "2026-11-21T09:00:00Z" });
    fenced.runs.status = async () => ({ run: "fenced" });
    const inSandbox = await viewWithRuns(fenced.runs);
    inSandbox.checkRuns();
    await settled();
    expect(inSandbox.review()?.unfencedYes).toBeUndefined();
    await inSandbox.grant(inSandbox.review()?.fingerprint ?? "", true);
    expect(fenced.allowed).toEqual([]);
  });
});
