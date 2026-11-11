// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type CloseStack, createCloseStack } from "../close-stack/close-stack.ts";
import { showPlace } from "../points/frame.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { BottomNavigation } from "./bottom-navigation.tsx";
import { MorePage } from "./more-page.tsx";
import { pressPhoneBack, usePhoneBackButton } from "./phone-back.ts";
import { PhoneTopBar } from "./phone-top-bar.tsx";
import { usePhonePlaces } from "./use-phone-places.ts";

let stepsBack: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  window.history.replaceState(null, "");
  stepsBack = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
});

afterEach(() => {
  unmountAll();
  stepsBack.mockRestore();
  for (const dialog of document.querySelectorAll("dialog")) {
    dialog.remove();
  }
});

const shownPlaces = [
  showPlace("home", undefined),
  showPlace("inbox", { mark: "count", value: 3, spoken: "3 waiting" }),
  showPlace("workflows", undefined),
  showPlace("runs", undefined),
];

/** The phone's bars and pages joined as the Studio joins them, with a page per location. */
function PhoneStudio({ closeStack }: { readonly closeStack: CloseStack }) {
  const places = usePhonePlaces();
  usePhoneBackButton(true, closeStack, places);
  return (
    <>
      <PhoneTopBar {...places.topBar} />
      <main>
        {places.page.location.key === "more" ? (
          <MorePage
            workspace={{ name: "Acme", folder: "~/Work/acme" }}
            onChangeWorkspace={() => undefined}
            places={shownPlaces}
            onOpen={places.openPlace}
          />
        ) : (
          <>
            <h1>{places.page.location.title}</h1>
            <button
              type="button"
              onClick={() => places.open({ key: "workflow:support-reply", title: "Support reply" })}
            >
              Open Support reply
            </button>
          </>
        )}
      </main>
      {places.navigation === undefined ? null : (
        <BottomNavigation places={shownPlaces} {...places.navigation} />
      )}
    </>
  );
}

function renderPhone(closeStack = createCloseStack()) {
  const container = render(<PhoneStudio closeStack={closeStack} />);
  const title = () => container.querySelector("header p")?.textContent;
  const hasBack = () => container.querySelector('header button[aria-label="Back"]') !== null;
  const hasNavigation = () => container.querySelector('nav[aria-label="Places"]') !== null;
  const tap = (selector: string, text?: string) => {
    const found = [...container.querySelectorAll<HTMLElement>(selector)].find(
      (element) => text === undefined || element.textContent?.includes(text),
    ) as HTMLElement;
    act(() => found.click());
  };
  const tapPlace = (name: string) => tap(`nav[aria-label="Places"] a[aria-label^="${name}"]`);
  // As the browser does: the shell's entry comes off, and `popstate` fires on the one under it.
  const pressBack = () =>
    act(() => {
      window.history.replaceState(null, "");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
  return { container, title, hasBack, hasNavigation, tap, tapPlace, pressBack };
}

verifies("shell.phone-back", () => {
  it("keeps one history entry of its own on top, however often back is pressed", () => {
    const pushes = vi.spyOn(window.history, "pushState");
    const phone = renderPhone();
    expect(window.history.state).toEqual({ halonicPhoneBack: true });
    phone.tapPlace("Inbox");
    phone.pressBack();
    expect(pushes).toHaveBeenCalledTimes(2);
    pushes.mockRestore();
  });

  it("closes the close stack's first layer before it moves", () => {
    const closeStack = createCloseStack();
    const phone = renderPhone(closeStack);
    phone.tapPlace("Inbox");
    let sheetOpen = true;
    closeStack.open({
      kind: "sheet",
      close: () => {
        sheetOpen = false;
        return true;
      },
    });
    phone.pressBack();
    expect(sheetOpen).toBe(false);
    expect(phone.title()).toBe("Inbox");
    phone.pressBack();
    expect(phone.title()).toBe("Home");
  });

  it("cancels an open modal dialog first, as its Cancel button would", () => {
    const closeStack = createCloseStack();
    let sheetOpen = true;
    closeStack.open({
      kind: "sheet",
      close: () => {
        sheetOpen = false;
        return true;
      },
    });
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    let cancelled = 0;
    dialog.addEventListener("cancel", () => {
      cancelled += 1;
    });
    document.body.append(dialog);
    expect(pressPhoneBack(closeStack, () => true)).toBe("handled");
    expect(cancelled).toBe(1);
    expect(sheetOpen).toBe(true);
  });

  it("cancels the innermost dialog when one is open inside another", () => {
    const form = document.createElement("dialog");
    form.setAttribute("open", "");
    const picker = document.createElement("dialog");
    picker.setAttribute("open", "");
    form.append(picker);
    document.body.append(form);
    const cancelled: string[] = [];
    form.addEventListener("cancel", () => cancelled.push("form"));
    picker.addEventListener("cancel", () => cancelled.push("picker"));
    pressPhoneBack(createCloseStack(), () => true);
    expect(cancelled).toEqual(["picker"]);
  });

  it("goes one page up, then to the place's top, then Home, and leaves from Home's top", () => {
    const phone = renderPhone();
    phone.tapPlace("More");
    phone.tap("tr [role=gridcell]", "Workflows");
    expect(phone.title()).toBe("Workflows");
    expect(phone.hasBack()).toBe(true);
    phone.tap("button", "Open Support reply");
    expect(phone.title()).toBe("Support reply");
    expect(phone.hasNavigation()).toBe(false);

    phone.pressBack();
    expect(phone.title()).toBe("Workflows");
    expect(phone.hasNavigation()).toBe(true);
    phone.pressBack();
    expect(phone.title()).toBe("More");
    expect(phone.hasBack()).toBe(false);
    phone.pressBack();
    expect(phone.title()).toBe("Home");
    expect(stepsBack).not.toHaveBeenCalled();

    phone.pressBack();
    expect(phone.title()).toBe("Home");
    expect(stepsBack).toHaveBeenCalledTimes(1);
  });

  it("puts its entry back on the next move when leaving from Home's top didn't leave", () => {
    const phone = renderPhone();
    phone.pressBack();
    expect(stepsBack).toHaveBeenCalledTimes(1);
    // The Studio is the first page in the tab, so the step back did nothing.
    expect(window.history.state).toBeNull();

    phone.tapPlace("Inbox");
    expect(window.history.state).toEqual({ halonicPhoneBack: true });
    phone.pressBack();
    expect(phone.title()).toBe("Home");
    expect(stepsBack).toHaveBeenCalledTimes(1);
  });

  it("goes back the same way from the top bar's Back button", () => {
    const phone = renderPhone();
    phone.tapPlace("More");
    phone.tap("tr [role=gridcell]", "Workflows");
    phone.tap('header button[aria-label="Back"]');
    expect(phone.title()).toBe("More");
  });

  it("takes focus to the new page's h1 after a move", () => {
    const phone = renderPhone();
    phone.tapPlace("Inbox");
    expect(document.activeElement?.textContent).toBe("Inbox");
    phone.tap("button", "Open Support reply");
    phone.pressBack();
    expect(document.activeElement?.textContent).toBe("Inbox");
  });

  it("leaves focus where it is when a tap changes nothing", () => {
    const phone = renderPhone();
    const home = phone.container.querySelector<HTMLElement>(
      'nav[aria-label="Places"] a[aria-label^="Home"]',
    ) as HTMLElement;
    home.focus();
    phone.tapPlace("Home");
    expect(document.activeElement).toBe(home);
  });
});
