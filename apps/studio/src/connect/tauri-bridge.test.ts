import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type PageWindow, releasePage, type TauriInternals, tauriBridge } from "./tauri-bridge.ts";

/** Records each call into the shell and answers it with `answer`. */
class FakeInternals implements TauriInternals {
  readonly calls: { command: string; args: Record<string, unknown> | undefined }[] = [];
  private readonly answer: unknown;

  constructor(answer: unknown = null) {
    this.answer = answer;
  }

  invoke(command: string, args?: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ command, args });
    return Promise.resolve(this.answer);
  }
}

/** Records what the page did to its window. */
class FakeWindow implements PageWindow {
  readonly steps: string[] = [];
  readonly history = {
    replaceState: (_data: unknown, _unused: string, url?: string | URL | null) => {
      this.steps.push(`replace ${String(url)}`);
    },
  };
  readonly location = {
    assign: (url: string | URL) => {
      this.steps.push(`open ${String(url)}`);
    },
  };
}

verifies("studio.connect.shell-bridge", () => {
  it("asks the shell's connect command about the address and returns its answer", async () => {
    const answer = { kind: "notHomeNetwork" };
    const internals = new FakeInternals(answer);

    const result = await tauriBridge(internals, new FakeWindow()).connect("8.8.8.8:4280");

    expect(result).toEqual(answer);
    expect(internals.calls).toEqual([{ command: "connect", args: { address: "8.8.8.8:4280" } }]);
  });

  it("marks its own history entry as Change address before opening the Studio", () => {
    const window = new FakeWindow();

    tauriBridge(new FakeInternals(), window).openStudio("http://192.168.1.20:4280/");

    expect(window.steps).toEqual(["replace #change-address", "open http://192.168.1.20:4280/"]);
  });

  it("opens only the release page, through the opener", async () => {
    const internals = new FakeInternals();

    await tauriBridge(internals, new FakeWindow()).openReleasePage();

    expect(internals.calls).toEqual([
      { command: "plugin:opener|open_url", args: { url: releasePage } },
    ]);
  });
});
