// @vitest-environment jsdom

import type { PairedPhone } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import type { CheckEvent } from "./pairing-flow.ts";
import { CheckStep, PairedStep } from "./pairing-steps.tsx";

afterEach(unmountAll);

const rightToLeftOverride = String.fromCodePoint(0x202e);
const zeroWidthSpace = String.fromCodePoint(0x200b);

function check(phoneName: string): CheckEvent {
  return {
    type: "check",
    checkCode: "7KQ2XM",
    phoneName,
    platform: "android",
    allowBy: "2026-11-16T08:02:00.000Z",
  };
}

/** The line that shows the phone's name: the strong one on Check the code. */
const nameLine = (view: HTMLElement) => view.querySelector("p.text-body-strong");

verifies("remote.pair-a-phone-name", () => {
  it("shows a direction character in the phone's name as a marker", () => {
    const view = render(
      <CheckStep check={check(`Pixel${rightToLeftOverride}8`)} provider="tailscale" />,
    );
    const line = nameLine(view);
    expect(line?.textContent).toBe("Pixel⟦U+202E⟧8");
    expect(line?.querySelector(".text-attention")?.textContent).toBe("⟦U+202E⟧");
    expect(view.textContent).not.toContain(rightToLeftOverride);
  });

  it("shows a zero-width character in the phone's name as a marker", () => {
    const view = render(
      <CheckStep check={check(`Pix${zeroWidthSpace}el 8`)} provider="tailscale" />,
    );
    expect(nameLine(view)?.textContent).toBe("Pix⟦U+200B⟧el 8");
    expect(view.textContent).not.toContain(zeroWidthSpace);
  });

  it("shows the first 64 characters of a longer name and an ellipsis", () => {
    const view = render(<CheckStep check={check("a".repeat(100))} provider="tailscale" />);
    expect(nameLine(view)?.textContent).toBe(`${"a".repeat(64)}…`);
  });

  it("shows a name of 64 characters whole", () => {
    const view = render(<CheckStep check={check("b".repeat(64))} provider="tailscale" />);
    expect(nameLine(view)?.textContent).toBe("b".repeat(64));
  });

  it("marks hidden characters in the paired title too", () => {
    const phone: PairedPhone = {
      id: "phone-1",
      name: `Pixel${rightToLeftOverride}8`,
      platform: "android",
      pairedAt: "2026-11-16T08:01:00.000Z",
      connected: false,
    };
    const view = render(<PairedStep phone={phone} allowRisky={false} onDone={() => undefined} />);
    expect(view.querySelector("h3")?.textContent).toContain("Pixel⟦U+202E⟧8");
    expect(view.textContent).not.toContain(rightToLeftOverride);
  });
});
