import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { RunEvent } from "./run-event.ts";
import {
  deniedPathGroupCodes,
  type SandboxOpenedOptions,
  sandboxOpenedView,
} from "./sandbox-opened.ts";

// Made-up home and temp folders; every other path is built from them.
const home = "/home/user"; // leak-guard: allow absolute-path a made-up home folder for the tests
const temp = "/tmp/halonic-run-1"; // leak-guard: allow absolute-path a made-up temp folder for the tests
const windowsHome = "C:\\Users\\user"; // leak-guard: allow absolute-path a made-up Windows home folder

// Shaped like the Sandbox port's SandboxProfile, which this package doesn't import.
const profile = {
  workingFolder: `${home}/work/site`,
  tempFolder: temp,
  settingsFolder: `${home}/.halonic/agents/writer`,
  readOnlyPaths: [`${home}/work/site/.halonic`],
  deniedPaths: [`${home}/.ssh`, `${home}/.aws`, `${home}/.halonic/data`, "/srv/private"],
  env: { API_TOKEN: "not-for-the-log", HOME: home },
  network: {
    bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 },
    allowedSites: ["registry.npmjs.org"],
  },
  timeLimitMs: 600_000,
};

const options: SandboxOpenedOptions = {
  strength: "os",
  home,
  deniedGroups: [
    { code: "ssh-keys", paths: [`${home}/.ssh`] },
    { code: "cloud-sign-ins", paths: [`${home}/.aws`] },
    { code: "halonic-data", paths: [`${home}/.halonic/data`] },
  ],
};

verifies("events.sandbox-opened", () => {
  it("copies the fixed list of fields and shortens home paths", () => {
    expect(sandboxOpenedView(profile, options)).toEqual({
      strength: "os",
      workingFolder: "~/work/site",
      readOnlyPaths: ["~/work/site/.halonic"],
      deniedGroups: ["ssh-keys", "cloud-sign-ins", "halonic-data"],
      deniedPaths: ["/srv/private"],
      allowedSites: ["registry.npmjs.org"],
      timeLimitMs: 600_000,
    });
  });

  it("leaves out env and any field not on the list", () => {
    const withExtra = {
      ...profile,
      futureField: "secret",
      network: { ...profile.network, proxy: "x" },
    };
    const view = sandboxOpenedView(withExtra, options);
    expect(Object.keys(view).sort()).toEqual([
      "allowedSites",
      "deniedGroups",
      "deniedPaths",
      "readOnlyPaths",
      "strength",
      "timeLimitMs",
      "workingFolder",
    ]);
    const logged = JSON.stringify(view);
    expect(logged).not.toContain("env");
    expect(logged).not.toContain("not-for-the-log");
    expect(logged).not.toContain("futureField");
    expect(logged).not.toContain("secret");
    expect(logged).not.toContain("proxy");
    expect(logged).not.toContain("4100");
  });

  it("logs denied paths as group codes plus the paths the person added", () => {
    const added = { ...profile, deniedPaths: [...profile.deniedPaths, `${home}/Documents/tax`] };
    const view = sandboxOpenedView(added, options);
    expect(view.deniedGroups).toEqual(["ssh-keys", "cloud-sign-ins", "halonic-data"]);
    expect(view.deniedPaths).toEqual(["/srv/private", "~/Documents/tax"]);
  });

  it("names a group only when all of its paths are denied", () => {
    const partial: SandboxOpenedOptions = {
      ...options,
      deniedGroups: [{ code: "ssh-keys", paths: [`${home}/.ssh`, "/etc/ssh/private"] }],
    };
    const view = sandboxOpenedView(profile, partial);
    expect(view.deniedGroups).toEqual([]);
    expect(view.deniedPaths).toEqual(["~/.ssh", "~/.aws", "~/.halonic/data", "/srv/private"]);
  });

  it("never names a group that has no paths", () => {
    const empty: SandboxOpenedOptions = {
      ...options,
      deniedGroups: [{ code: "browser-data", paths: [] }],
    };
    expect(sandboxOpenedView(profile, empty).deniedGroups).toEqual([]);
  });

  it("lists a denied path once even when the profile repeats it", () => {
    const twice = { ...profile, deniedPaths: ["/srv/private", "/srv/private"] };
    expect(sandboxOpenedView(twice, options).deniedPaths).toEqual(["/srv/private"]);
  });

  it("shortens only paths in the home folder itself", () => {
    const paths = {
      ...profile,
      readOnlyPaths: [home, `${home}name/x`, `${home}\\notes`],
    };
    expect(sandboxOpenedView(paths, { ...options, home: `${home}/` }).readOnlyPaths).toEqual([
      "~",
      `${home}name/x`,
      "~\\notes",
    ]);
  });

  it("shortens Windows home paths", () => {
    const windows = {
      ...profile,
      workingFolder: `${windowsHome}\\work`,
      deniedPaths: [`${windowsHome}\\private`],
    };
    const view = sandboxOpenedView(windows, { ...options, home: windowsHome });
    expect(view.workingFolder).toBe("~\\work");
    expect(view.deniedPaths).toEqual(["~\\private"]);
  });

  it("keeps paths as they are when the home folder is unknown or empty", () => {
    expect(sandboxOpenedView(profile, { ...options, home: null }).workingFolder).toBe(
      `${home}/work/site`,
    );
    expect(sandboxOpenedView(profile, { ...options, home: "/" }).workingFolder).toBe(
      `${home}/work/site`,
    );
  });

  it("never logs the temp folder or the settings folder, which the screens don't show", () => {
    const logged = JSON.stringify(sandboxOpenedView(profile, options));
    expect(logged).not.toContain(temp);
    expect(logged).not.toContain("halonic-run-1");
    expect(logged).not.toContain("agents/writer");
  });

  it("returns lists the caller can't change through the profile", () => {
    const view = sandboxOpenedView(profile, options);
    expect(view.allowedSites).not.toBe(profile.network.allowedSites);
    expect(view.readOnlyPaths).not.toBe(profile.readOnlyPaths);
  });

  it("fits a sandbox.opened run event", () => {
    const event: RunEvent = {
      runId: "r",
      seq: 3,
      at: "2026-11-09T10:00:00Z",
      type: "sandbox.opened",
      state: "build",
      agent: "writer",
      sandbox: sandboxOpenedView(profile, options),
    };
    expect(event.sandbox.strength).toBe("os");
  });

  it("names the six groups of denied paths in one list", () => {
    expect(deniedPathGroupCodes).toEqual([
      "ssh-keys",
      "cloud-sign-ins",
      "browser-data",
      "password-stores",
      "halonic-data",
      "agent-settings",
    ]);
  });
});
