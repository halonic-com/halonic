import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { tauriPhoneScreens } from "./tauri-phone-screens.ts";
import { settled } from "./test/connect-page-harness.ts";

const pullRequest = "https://github.com/acme/app/pull/12";

verifies("studio.connect.phone-tunnel-screens", () => {
  it("opens Android's settings and Tailscale through the shell, with nothing from the page", async () => {
    const invoke = vi.fn(() => Promise.resolve(true));
    const report = vi.fn();
    const screens = tauriPhoneScreens({ invoke }, report);

    screens.openSettings();
    screens.openTailscale();
    await settled();

    expect(invoke.mock.calls).toEqual([["phone_open_settings"], ["phone_open_tailscale"]]);
    expect(report).not.toHaveBeenCalled();
  });

  it("logs a screen that didn't open, or a refused call, and throws nothing", async () => {
    const answers = [Promise.resolve(false), Promise.reject(new Error("not allowed"))];
    const report = vi.fn();
    const screens = tauriPhoneScreens(
      { invoke: () => answers.shift() as Promise<unknown> },
      report,
    );

    screens.openSettings();
    screens.openTailscale();
    await settled();

    expect(report.mock.calls).toEqual([
      ["phone_open_settings opened nothing."],
      ["phone_open_tailscale was refused: Error: not allowed"],
    ]);
  });
});

verifies("studio.connect.phone-links", () => {
  it("opens a pull request's link through the shell's opener, unchanged", async () => {
    const invoke = vi.fn(() => Promise.resolve(undefined));
    const report = vi.fn();
    tauriPhoneScreens({ invoke }, report).openLink(pullRequest);
    await settled();

    expect(invoke.mock.calls).toEqual([["plugin:opener|open_url", { url: pullRequest }]]);
    expect(report).not.toHaveBeenCalled();
  });

  it("calls nothing for a link isAllowedWebLink refuses, and logs a refused opener", async () => {
    const invoke = vi.fn(() => Promise.reject(new Error("not allowed")));
    const report = vi.fn();
    const screens = tauriPhoneScreens({ invoke }, report);

    screens.openLink("https://github.com.evil.io/acme/app/pull/12");
    expect(invoke).not.toHaveBeenCalled();
    screens.openLink(pullRequest);
    await settled();

    expect(invoke).toHaveBeenCalledOnce();
    expect(report.mock.calls).toEqual([
      ["The page refused to open a link isAllowedWebLink doesn't pass."],
      ["plugin:opener|open_url was refused: Error: not allowed"],
    ]);
  });
});
