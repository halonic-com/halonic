// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import type { PairingFrom } from "./phone-pairing.ts";
import { ProblemScreen, type ProblemScreenOf, problemWords } from "./problem-screen.tsx";

afterEach(unmountAll);

const laptop = "Tim's laptop";
const scanned: PairingFrom = { route: "qr" };
const typedOnWifi: PairingFrom = { route: "typed", wifi: true };

function show(problem: ProblemScreenOf, from: PairingFrom = scanned) {
  const onAction = vi.fn();
  const onCancel = vi.fn();
  const screen = render(
    <ProblemScreen
      problem={problem}
      computer={laptop}
      from={from}
      onAction={onAction}
      onCancel={onCancel}
    />,
  );
  const buttons = [...screen.querySelectorAll("button")];
  return { screen, buttons, onAction, onCancel };
}

const click = (button: HTMLButtonElement | undefined) => act(() => button?.click());

verifies("remote.phone-pairing-problems", () => {
  it("starts over on the route it came from when the code is spent", () => {
    expect(problemWords({ screen: "ended", noAllow: false }, laptop, scanned).actionLabel).toBe(
      "Scan again",
    );
    expect(problemWords({ screen: "refused" }, laptop, typedOnWifi).actionLabel).toBe(
      "Type a code again",
    );
    const used = problemWords({ screen: "used" }, laptop, typedOnWifi);
    expect(used.lines).toEqual([
      "Another phone used it first. If Tim's laptop asks you to allow a phone now, press **Don't allow**: it isn't yours.",
      "Then choose New code on the computer and type it in.",
    ]);
  });

  it("gives the reason Allow wasn't pressed in time", () => {
    const { screen } = show({ screen: "ended", noAllow: true });
    expect(screen.querySelector("h2")?.textContent).toBe("This code no longer works");
    expect(screen.textContent).toContain("Allow wasn't pressed on Tim's laptop in time.");
  });

  it("sends the same code again after too many tries, with Cancel", () => {
    const { screen, buttons, onAction, onCancel } = show({ screen: "rateLimited" }, typedOnWifi);
    expect(screen.querySelector("h2")?.textContent).toBe("Too many tries on Tim's laptop");
    expect(buttons.map((button) => button.textContent)).toEqual(["Try again", "Cancel"]);
    click(buttons[0]);
    expect(onAction).toHaveBeenCalledWith("tryAgain");
    click(buttons[1]);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("asks to scan again when it can't confirm the computer, never that the code stopped", () => {
    const { screen, buttons, onAction } = show({ screen: "cantConfirm" });
    expect(screen.querySelector("h2")?.textContent).toBe("Can't confirm it's Tim's laptop");
    expect(screen.textContent).not.toContain("no longer works");
    expect(buttons.map((button) => button.textContent)).toEqual(["Scan again", "Cancel"]);
    click(buttons[0]);
    expect(onAction).toHaveBeenCalledWith("again");
  });

  it("says nothing was shared when the computer's answer can't be read", () => {
    const { screen } = show({ screen: "unreadable" });
    expect(screen.querySelector("h2")?.textContent).toBe("Couldn't read Tim's laptop's answer");
    expect(screen.textContent).toContain("Nothing was shared.");
  });

  it("checks the computer when it doesn't answer, on the route's network", () => {
    const tailscale = show({ screen: "unreachable", wifi: false, phoneOffline: false });
    expect(tailscale.screen.textContent).toContain("Tailscale is on for both");
    unmountAll();
    const wifi = show({ screen: "unreachable", wifi: true, phoneOffline: false }, typedOnWifi);
    expect(wifi.screen.querySelector("h2")?.textContent).toBe("Can't reach Tim's laptop");
    expect(wifi.screen.textContent).toContain("both are on the same Wi-Fi");
  });

  it("checks the phone, not the computer, when the phone is offline", () => {
    const { screen, buttons } = show({ screen: "unreachable", wifi: false, phoneOffline: true });
    expect(screen.querySelector("h2")?.textContent).toBe("Your phone is offline");
    expect(screen.textContent).toContain("Turn on Wi-Fi or mobile data");
    expect(screen.textContent).not.toContain("Check that the computer is on");
    expect(buttons.map((button) => button.textContent)).toEqual(["Try again", "Cancel"]);
    expect(
      problemWords({ screen: "unreachable", wifi: true, phoneOffline: true }, laptop, typedOnWifi)
        .lines,
    ).toEqual([
      "It isn't on Wi-Fi, so it can't reach Tim's laptop. Connect to the same Wi-Fi as the computer, then try again.",
    ]);
  });

  it("shows the generic screen with no sentence about the person's code", () => {
    const { screen, buttons } = show({ screen: "generic" });
    expect(screen.querySelector("h2")?.textContent).toBe("Couldn't start pairing");
    expect(buttons.map((button) => button.textContent)).toEqual(["Scan again"]);
  });

  it("moves focus to the title, so TalkBack reads the new screen", () => {
    const { screen } = show({ screen: "refused" });
    expect(document.activeElement).toBe(screen.querySelector("h2"));
    expect(screen.querySelector("h2")?.textContent).toBe("Tim's laptop didn't allow this phone");
  });

  it("renders a control's name in bold, without the marks", () => {
    const { screen } = show({ screen: "used" });
    expect(screen.querySelector("strong")?.textContent).toBe("Don't allow");
    expect(screen.textContent).not.toContain("**");
  });
});
