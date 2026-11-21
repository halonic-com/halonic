// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import type { RoutinesHost } from "../api.ts";
import { buttonNamed, unmount } from "../test-support.tsx";
import { daily, hostReading, showWithToasts } from "./page.test-helper.tsx";

afterEach(unmount);

const line = "Changes not live yet";
const link = "Review and make live";

/**
 * Daily with changes that aren't live until a version is made, with `makeLive` answering `answer`
 * (or rejecting with it when it is an error); `asked` counts the times it was asked.
 */
function hostMaking(answer: "made" | "cancelled" | Error) {
  let changesNotLive = true;
  const asked = { makeLive: 0 };
  const { host: reading } = hostReading(() => ({ ...daily, changesNotLive }));
  const host: RoutinesHost = {
    ...reading,
    makeLive: async () => {
      asked.makeLive += 1;
      if (answer instanceof Error) throw answer;
      if (answer === "made") changesNotLive = false;
      return answer;
    },
  };
  return { host, asked };
}

verifies("routines.page.review-and-make-live", () => {
  it("makes the routine live from the line, reads it again and gives its name the focus", async () => {
    const { host, asked } = hostMaking("made");
    const { page } = await showWithToasts(host);
    expect(page.textContent).toContain(`${line} ${link}`);
    const button = buttonNamed(page, link);
    button?.focus();

    await act(async () => button?.click());
    expect(asked.makeLive).toBe(1);
    expect(page.textContent).not.toContain(line);
    expect(document.activeElement).toBe(page.querySelector("h1"));
  });

  it("keeps the line when Create version closes without a version, or says why it couldn't", async () => {
    const cancelled = await showWithToasts(hostMaking("cancelled").host);
    await act(async () => buttonNamed(cancelled.page, link)?.click());
    expect(cancelled.page.textContent).toContain(line);
    expect(cancelled.toasts.list()).toEqual([]);
    unmount();

    const failing = await showWithToasts(
      hostMaking(new KindedError("unavailable", "No room.")).host,
    );
    await act(async () => buttonNamed(failing.page, link)?.click());
    expect(failing.toasts.list()[0]).toMatchObject({
      tone: "danger",
      title: "Couldn't make Daily live.",
      text: "No room.",
    });
    expect(failing.page.textContent).toContain(line);
  });

  it("has no link where the host can't make a routine live", async () => {
    const { makeLive: _makeLive, ...cannotMake } = hostMaking("made").host;
    const { page } = await showWithToasts(cannotMake);
    expect(page.textContent).toContain(line);
    expect(buttonNamed(page, link)).toBeUndefined();
  });
});
