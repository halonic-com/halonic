// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { TrustCheckDialog } from "./trust-check-dialog.tsx";
import type { TrustReview } from "./workspace-trust-control.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let element: HTMLElement;
let root: Root;

beforeEach(() => {
  // jsdom has no <dialog> methods.
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
  element = document.createElement("div");
  document.body.append(element);
  root = createRoot(element);
});

afterEach(() => {
  act(() => root.unmount());
  element.remove();
});

const checkbox = "I understand plugins and integrations run without the sandbox on this computer";
const amber =
  "Not in the sandbox on this computer, so it may be able to use your files, programs and sign-ins, and reach other addresses.";

const review: TrustReview = {
  title: "Trust Acme?",
  source: "Acme · /work/acme",
  changed: false,
  summary: ["Will run 1 integration and list 1 address."],
  sections: [
    {
      heading: "Integrations (1)",
      open: true,
      mark: "warning",
      rows: [
        {
          id: "home-station",
          detail: "",
          flag: "not in the sandbox",
          lines: [
            ["Folder", "integrations/home-station/"],
            ["Runs", amber, "warning"],
            ["", "Halonic is running inside a container, and the sandbox can't start there."],
          ],
        },
      ],
    },
  ],
  fingerprint: "hfp1:abc",
  unpinned: [],
  footnote: "Programs you trust run with your access.",
  unfencedYes: { reason: "container", checkbox },
};

function dialog(): HTMLDialogElement {
  const found = document.querySelector("dialog");
  if (found === null) throw new Error("No dialog");
  return found;
}

function trustButton(): HTMLButtonElement {
  const found = [...dialog().querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.startsWith("Trust") === true,
  );
  if (found === undefined) throw new Error("No Trust button");
  return found;
}

function render(shown: TrustReview, trusted: boolean[]) {
  act(() =>
    root.render(
      <TrustCheckDialog
        review={shown}
        shown={shown.fingerprint}
        busy={false}
        error={undefined}
        onNotNow={() => {}}
        onTrust={(allowUnfenced) => trusted.push(allowUnfenced)}
        returnFocus={() => null}
      />,
    ),
  );
}

verifies("workspace.trust-check-unfenced-yes", () => {
  it("keeps Trust unavailable but focusable until the box is ticked, then passes the tick", () => {
    const trusted: boolean[] = [];
    render(review, trusted);

    const trust = trustButton();
    expect(trust.getAttribute("aria-disabled")).toBe("true");
    expect(trust.disabled).toBe(false);
    const described = document.getElementById(trust.getAttribute("aria-describedby") ?? "");
    expect(described?.textContent).toBe(checkbox);
    act(() => trust.click());
    expect(trusted).toEqual([]);

    act(() => dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')?.click());
    act(() => trustButton().click());
    expect(trusted).toEqual([true]);
  });

  it("clears the tick when the reason changes", () => {
    render(review, []);
    act(() => dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')?.click());

    render({ ...review, unfencedYes: { reason: "windows", checkbox } }, []);

    expect(dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(false);
    expect(trustButton().getAttribute("aria-disabled")).toBe("true");
  });

  it("says the warning in words, with the triangle hidden, after the name and in Runs", () => {
    render(review, []);

    const text = dialog().textContent ?? "";
    expect(text).toContain("· not in the sandbox");
    expect(text).toContain(`Runs: ${amber}`);
    const amberLine = [...dialog().querySelectorAll(".text-attention")].map(
      (each) => each.textContent?.trim() ?? "",
    );
    expect(amberLine).toContain(amber);
    expect(amberLine).toContain("not in the sandbox");
    for (const mark of dialog().querySelectorAll(".text-attention [aria-hidden='true']")) {
      expect(mark.textContent).toBe("");
    }
  });

  it("puts the dot before the triangle, with no empty detail between it and the name (C667)", () => {
    render(review, []);

    const name = [...dialog().querySelectorAll("code")].find(
      (each) => each.textContent === "home-station",
    );
    const row = name?.parentElement;
    // The name, then the flag: no empty detail span keeping its gap between them.
    expect(row?.children).toHaveLength(2);
    const flag = row?.lastElementChild;
    expect(flag?.textContent).toBe("· not in the sandbox");
    // The dot stays plain; the amber words start with the triangle.
    const amber = flag?.querySelector(".text-attention");
    expect(amber?.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
    expect(amber?.textContent).toBe("not in the sandbox");
  });

  it("stacks the flag under the name without the dot in a phone-narrow row (C678)", () => {
    render(review, []);

    const name = [...dialog().querySelectorAll("code")].find(
      (each) => each.textContent === "home-station",
    );
    const flag = name?.parentElement?.lastElementChild;
    // The row is the container; under 24rem the flag takes its own line and the dot goes.
    expect(name?.parentElement?.parentElement?.className.split(" ")).toContain("@container");
    expect(flag?.className.split(" ")).toContain("@max-[24rem]:basis-full");
    const dot = flag?.firstElementChild;
    expect(dot?.textContent).toBe("· ");
    expect(dot?.className.split(" ")).toContain("@max-[24rem]:hidden");
  });

  it("asks nothing, and Trust passes no tick, without unfencedYes", () => {
    const trusted: boolean[] = [];
    const { unfencedYes: _, ...fenced } = review;
    render(fenced, trusted);

    expect(dialog().textContent).not.toContain(checkbox);
    act(() => trustButton().click());
    expect(trusted).toEqual([false]);
  });
});
