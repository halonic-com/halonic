import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { downloadFraction } from "./updater-progress.ts";
import type { UpdateState } from "./updater-status.ts";

const downloading = (done: number, total: number | null): UpdateState => ({
  kind: "downloading",
  version: "0.1.1",
  done,
  total,
  unit: "bytes",
});

verifies("settings.updater-interface", () => {
  it("gives the fraction done once the total is known", () => {
    expect(downloadFraction(downloading(12, 48))).toBe(0.25);
  });

  it("gives no fraction from the first byte until the server says the total", () => {
    expect(downloadFraction(downloading(0, null))).toBeNull();
    expect(downloadFraction(downloading(5, 0))).toBeNull();
  });

  it("never goes past the whole", () => {
    expect(downloadFraction(downloading(60, 48))).toBe(1);
  });

  it("gives no fraction outside a download", () => {
    expect(downloadFraction({ kind: "up-to-date" })).toBeNull();
  });
});
