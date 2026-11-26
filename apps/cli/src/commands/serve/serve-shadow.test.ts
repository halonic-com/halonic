import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { paperclipKeySecretName } from "./serve-messaging.ts";
import { openServeShadow, type ServeShadowOptions } from "./serve-shadow.ts";
import { parseShadowConfig, shadowFolder } from "./serve-shadow-config.ts";

const connection = "acme";
const company = "company-acme";
const config = {
  connection,
  issueId: "issue-1",
  neverListDocumentId: "doc-never",
  stopDocumentId: "doc-stop",
  ownerUserIds: ["user-owner"],
};
const stored = JSON.stringify({
  key: "acme-test-key",
  address: "https://paperclip.acme.test",
  company,
});

let profile: string;
let time: Date;

beforeEach(async () => {
  profile = await mkdtemp(join(tmpdir(), "halonic-serve-shadow-"));
  time = new Date("2026-11-27T10:00:00.000Z");
});

afterEach(async () => {
  await rm(profile, { recursive: true, force: true });
});

/** A Paperclip that answers every request with 500 and the server's `Date`, and records them. */
function failingPaperclip() {
  const seen: { method: string; url: string }[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    seen.push({ method: init?.method ?? "GET", url: String(input) });
    return new Response("{}", { status: 500, headers: { date: time.toUTCString() } });
  };
  return { seen, fetch: fetch as typeof globalThis.fetch };
}

/** Timers the test runs by hand. */
function manualTimers() {
  const due: { ms: number; run: () => void }[] = [];
  const setTimer = (ms: number, run: () => void) => {
    due.push({ ms, run });
    return () => undefined;
  };
  return { due, setTimer };
}

function options(fetch: typeof globalThis.fetch, extra: Partial<ServeShadowOptions> = {}) {
  const logged: string[] = [];
  const keys = {
    get: async (name: string) => (name === paperclipKeySecretName(connection) ? stored : null),
  };
  const opened: ServeShadowOptions = {
    profileFolder: profile,
    keys,
    log: (failure) => logged.push(failure instanceof Error ? failure.message : String(failure)),
    clock: { now: () => time },
    fetch,
    ...extra,
  };
  return { opened, logged };
}

async function writeConfig(text: string): Promise<void> {
  await mkdir(shadowFolder(profile), { recursive: true });
  await writeFile(join(shadowFolder(profile), "shadow.json"), text);
}

async function digestOf(day: string): Promise<string> {
  return readFile(join(shadowFolder(profile), "digests", `${day}.txt`), "utf8");
}

async function ledgerReasons(): Promise<string[]> {
  const text = await readFile(join(shadowFolder(profile), "shadow-ledger.jsonl"), "utf8");
  return text
    .trim()
    .split("\n")
    .map((line) => (JSON.parse(line) as { reason: string }).reason);
}

/** Runs the timer due at `index` and waits for its poll and digest: the loop sets the next timer last. */
async function runTimer(timers: ReturnType<typeof manualTimers>, index: number): Promise<void> {
  timers.due[index]?.run();
  await waitUntil("the next timer", () => timers.due.length > index + 1);
}

verifies("cli.commands.serve.auto-approvals-shadow", () => {
  describe("openServeShadow", () => {
    it("reads nothing without a config", async () => {
      const paperclip = failingPaperclip();
      expect(await openServeShadow(options(paperclip.fetch).opened)).toBeUndefined();
      expect(paperclip.seen).toEqual([]);
    });

    it("logs and stays off with a config it can't use or no stored key", async () => {
      await writeConfig(JSON.stringify({ ...config, extra: true }));
      const wrongShape = options(failingPaperclip().fetch);
      expect(await openServeShadow(wrongShape.opened)).toBeUndefined();
      expect(wrongShape.logged).toEqual([
        "The auto approvals shadow runner didn't start: its config is wrong-shape.",
      ]);

      await writeConfig(JSON.stringify({ ...config, connection: "other" }));
      const noKey = options(failingPaperclip().fetch);
      expect(await openServeShadow(noKey.opened)).toBeUndefined();
      expect(noKey.logged[0]).toContain("no stored Paperclip key");
    });

    it("polls with GETs only, on a timer, and writes the day's digest", async () => {
      await writeConfig(JSON.stringify(config));
      const paperclip = failingPaperclip();
      const timers = manualTimers();
      const shadow = await openServeShadow(options(paperclip.fetch, timers).opened);
      await shadow?.start();
      expect(timers.due.map((timer) => timer.ms)).toEqual([0]);
      await runTimer(timers, 0);
      expect(paperclip.seen.length).toBeGreaterThan(0);
      expect(paperclip.seen.every((request) => request.method === "GET")).toBe(true);
      expect(await ledgerReasons()).toEqual(["run.started", "read.status"]);
      const digest = await digestOf("2026-11-27");
      expect(digest).toContain("Runner: running");
      expect(digest).toContain("Calls to Paperclip since 10:00 UTC: 1 sent");
      expect(timers.due.map((timer) => timer.ms)).toEqual([0, 5 * 60_000]);
      shadow?.close();
    });

    it("finishes the last day's digest and counts the new day's calls from midnight", async () => {
      await writeConfig(JSON.stringify(config));
      const timers = manualTimers();
      const shadow = await openServeShadow(options(failingPaperclip().fetch, timers).opened);
      await shadow?.start();
      await runTimer(timers, 0);
      time = new Date("2026-11-28T00:03:00.000Z");
      await runTimer(timers, 1);
      expect(await readdir(join(shadowFolder(profile), "digests"))).toEqual([
        "2026-11-27.txt",
        "2026-11-28.txt",
      ]);
      expect(await digestOf("2026-11-27")).toContain("Polls: 1, stopped: 1, restarts: 1");
      expect(await digestOf("2026-11-28")).toContain("Calls to Paperclip since 00:00 UTC: 1 sent");
      shadow?.close();
    });

    it("halts on a ledger without the last digest's head, says so, and never polls", async () => {
      await writeConfig(JSON.stringify(config));
      const digests = join(shadowFolder(profile), "digests");
      await mkdir(digests, { recursive: true });
      await writeFile(join(digests, "2026-11-26.txt"), "Ledger head: 0123abcd\n");
      const paperclip = failingPaperclip();
      const timers = manualTimers();
      const shadow = await openServeShadow(options(paperclip.fetch, timers).opened);
      await shadow?.start();
      expect(timers.due).toEqual([]);
      expect(paperclip.seen).toEqual([]);
      expect(await digestOf("2026-11-27")).toContain(
        "Runner: halted since 2026-11-27 10:00 UTC (ledger.head_mismatch), until a person restarts it",
      );
    });
  });

  describe("parseShadowConfig", () => {
    it("takes exactly the five fields with ids Paperclip could give", () => {
      expect(parseShadowConfig(JSON.stringify(config))).toEqual(config);
      expect(parseShadowConfig(JSON.stringify({ ...config, ownerUserIds: [] }))).toBe(
        "wrong-shape",
      );
      expect(parseShadowConfig(JSON.stringify({ ...config, issueId: "../x" }))).toBe("wrong-shape");
      expect(parseShadowConfig("not json")).toBe("wrong-shape");
    });
  });
});
