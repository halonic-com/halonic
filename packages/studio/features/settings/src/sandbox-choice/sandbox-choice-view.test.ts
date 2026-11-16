import type { SandboxBackendId, SandboxBackendStatus, SandboxChoice } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { sandboxChoiceView } from "./sandbox-choice-view.ts";

const backend = (
  id: SandboxBackendId,
  over: Partial<SandboxBackendStatus> = {},
): SandboxBackendStatus => ({
  id,
  offered: true,
  state: "available",
  reason: null,
  setup: null,
  missing: [],
  limits: [],
  residuals: [],
  ...over,
});
const choice = (backends: SandboxBackendStatus[], active: SandboxChoice["active"] = null) => ({
  active,
  setting: null,
  backends,
});

verifies("settings.sandbox-choice-view", () => {
  it("recommends srt inside WSL on Windows and lists native srt as Experimental", () => {
    const view = sandboxChoiceView(choice([backend("srt"), backend("srt-wsl")]), "win32");
    expect(view.recommended).toMatchObject({ id: "srt-wsl", badge: "Recommended" });
    expect(view.options.map((card) => card.id)).toEqual(["srt-wsl", "srt"]);
    expect(view.options[1]).toMatchObject({
      badge: "Experimental",
      whatHappens: "Windows will ask for administrator permission once. No restart needed.",
    });
    expect(view.options[1]?.caveat).toContain("weaker than for files");
  });

  it("recommends srt on macOS and on Linux, each with its own line", () => {
    const mac = sandboxChoiceView(choice([backend("srt")]), "darwin").recommended;
    const linux = sandboxChoiceView(choice([backend("srt")]), "linux").recommended;
    expect(mac).toMatchObject({
      id: "srt",
      name: "Sandbox on this computer",
      badge: "Recommended",
    });
    expect(mac?.whatHappens).toBe("Nothing to install. We'll check that it works.");
    expect(linux?.whatHappens).toBe("We'll check that everything it needs is installed.");
  });

  it("leaves out a backend the computer doesn't offer, and has no recommendation when srt-wsl is out", () => {
    const view = sandboxChoiceView(
      choice([backend("srt-wsl", { offered: false }), backend("mxc", { offered: false })]),
      "win32",
    );
    expect(view.recommended).toBeNull();
    expect(view.options).toEqual([]);
  });

  it("shows a backend that can't run as disabled with the reason in words", () => {
    const view = sandboxChoiceView(
      choice([
        backend("srt"),
        backend("docker-sbx", { state: "not-available", reason: "virtualisation-off" }),
      ]),
      "linux",
    );
    expect(view.options[1]).toMatchObject({
      use: "disabled",
      disabledReason: "Hardware virtualisation is turned off on this computer.",
      badge: "Needs Docker",
    });
  });

  it("reads a trust-check code on a not-available backend as the general reason", () => {
    const view = sandboxChoiceView(
      choice([backend("srt", { state: "not-available", reason: "too-strict" })]),
      "linux",
    );
    expect(view.recommended?.disabledReason).toBe("It can't run on this computer.");
  });

  it("shows a failed safety test as disabled, and the backend in use as current", () => {
    const view = sandboxChoiceView(
      choice(
        [
          backend("srt-wsl", { state: "check-failed", reason: "dns-reachable" }),
          backend("srt", { state: "in-use" }),
        ],
        "srt",
      ),
      "win32",
    );
    expect(view.options[0]).toMatchObject({ use: "disabled" });
    expect(view.options[0]?.disabledReason).toContain("safety test didn't pass");
    expect(view.options[1]).toMatchObject({ use: "current", badge: "In use" });
  });

  it("keeps a backend that needs a setup selectable, and puts the cloud warning and confirmation on cloud", () => {
    const view = sandboxChoiceView(
      choice([
        backend("srt", { state: "setup-needed", reason: "bubblewrap-missing" }),
        backend("cloud"),
      ]),
      "linux",
    );
    expect(view.recommended?.use).toBe("selectable");
    expect(view.options[1]).toMatchObject({
      id: "cloud",
      needsConfirmation: true,
      badge: "Files leave your machine",
    });
    expect(view.options[1]?.warning).toContain("project files are uploaded");
    expect(view.recommended?.needsConfirmation).toBe(false);
  });
});
