// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { openInNewTab } from "./open-external.tsx";

const audiencePage = "https://console.cloud.google.com/auth/audience";
const signInPage = "https://accounts.google.com/o/oauth2/v2/auth?state=fake-state";

/** A tab as `window.open` returns it, with only what openInNewTab touches. */
function fakeTab() {
  return { opener: window as unknown, location: { href: "" }, close: vi.fn() };
}

/** A promise and the functions that settle it, so a test decides when the address arrives. */
function later<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

verifies("kit.external-link", () => {
  it("opens a known address in a new tab without a handle back to Studio", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    await openInNewTab(audiencePage);
    expect(open).toHaveBeenCalledExactlyOnceWith(audiencePage, "_blank", "noopener,noreferrer");
  });
});

verifies("kit.external-link-requested-address", () => {
  it("opens the tab before the address arrives, so the browser doesn't block it", async () => {
    const tab = fakeTab();
    const open = vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    const address = later<string>();

    const opening = openInNewTab(address.promise);

    expect(open).toHaveBeenCalledExactlyOnceWith("", "_blank");
    expect(tab.opener).toBeNull();
    expect(tab.location.href).toBe("");

    address.resolve(signInPage);
    await opening;
    expect(tab.location.href).toBe(signInPage);
    expect(tab.close).not.toHaveBeenCalled();
  });

  it("closes the tab again when the address doesn't arrive", async () => {
    const tab = fakeTab();
    vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    const failure = new Error("The start route failed.");

    await expect(openInNewTab(Promise.reject(failure))).rejects.toBe(failure);

    expect(tab.close).toHaveBeenCalledOnce();
    expect(tab.location.href).toBe("");
  });

  it("tries once more with the address when the browser refused the empty tab", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    await openInNewTab(Promise.resolve(signInPage));
    expect(open).toHaveBeenLastCalledWith(signInPage, "_blank", "noopener,noreferrer");
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("still reports a failed address when the browser refused the empty tab", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const failure = new Error("The start route failed.");
    await expect(openInNewTab(Promise.reject(failure))).rejects.toBe(failure);
  });
});
