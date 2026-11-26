// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { OpenExternal } from "../external-link/open-external.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { ChatText } from "./chat-text.tsx";

afterEach(() => {
  unmountAll();
});

function renderWithAppLinks(source: string) {
  const openAppLink = vi.fn<(path: string) => void>();
  const openLink = vi.fn<OpenExternal>(async () => {});
  const { container } = render(
    <ChatText openLink={openLink} openAppLink={openAppLink}>
      {source}
    </ChatText>,
  );
  return { container, openAppLink, openLink };
}

function click(button: HTMLButtonElement): void {
  act(() => {
    button.click();
  });
}

verifies("kit.chat-text-app-links", () => {
  it("opens a task link through the caller's function, showing only its words", () => {
    const { container, openAppLink } = renderWithAppLinks(
      "Done in [ACME-42](/ACME/issues/ACME-42).",
    );
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(container.textContent).toBe("Done in ACME-42.");
    expect(button.textContent).toBe("ACME-42");
    expect(button.type).toBe("button");
    click(button);
    expect(openAppLink).toHaveBeenCalledExactlyOnceWith("/ACME/issues/ACME-42");
  });

  it("opens an approval link and an agent link, with a #part", () => {
    const { container, openAppLink } = renderWithAppLinks(
      "[the approval](/ACME/approvals/7f3a-b2) and [Noah](/ACME/agents/noah#runs)",
    );
    const [approval, agent] = container.querySelectorAll("button");
    click(approval as HTMLButtonElement);
    click(agent as HTMLButtonElement);
    expect(openAppLink.mock.calls).toEqual([
      ["/ACME/approvals/7f3a-b2"],
      ["/ACME/agents/noah#runs"],
    ]);
  });

  it("shows an app link's words as text without openAppLink", () => {
    const { container } = render(<ChatText>{"[the approval](/ACME/approvals/7f3a)"}</ChatText>);
    expect(container.textContent).toBe("the approval");
    expect(container.querySelector("a, button, [href], [onclick]")).toBeNull();
  });

  it("keeps a web link as it was", () => {
    const { container, openAppLink, openLink } = renderWithAppLinks(
      "See [the PR](https://example.com/pr/1).",
    );
    expect(container.textContent).toBe(
      "See the PR ↗ (opens in your browser) (https://example.com/pr/1).",
    );
    expect(container.querySelector("button")).toBeNull();
    (container.querySelector("a") as HTMLAnchorElement).click();
    expect(openLink).toHaveBeenCalledExactlyOnceWith("https://example.com/pr/1");
    expect(openAppLink).not.toHaveBeenCalled();
  });

  it("shows javascript:, data:, //host and other paths as written", () => {
    const source = [
      "[a](javascript:alert(1))",
      "[b](data:text/html,hi)",
      "[c](//example.com/ACME/issues/1)",
      "[d](/ACME/settings)",
      "[e](/ACME/issues/../secrets)",
      "[f](/ACME/issues/ACME-1?x=1)",
      "[g](ACME/issues/ACME-1)",
    ].join(" ");
    const { container, openAppLink } = renderWithAppLinks(source);
    expect(container.textContent).toBe(source);
    expect(container.querySelector("a, button, [href], [onclick]")).toBeNull();
    expect(openAppLink).not.toHaveBeenCalled();
  });

  it("reads an app link inside a list item and inside bold", () => {
    const { container, openAppLink } = renderWithAppLinks(
      "- Fixed in [ACME-1](/ACME/issues/ACME-1)\n- **See [ACME-2](/ACME/issues/ACME-2)**",
    );
    const items = container.querySelectorAll("li");
    expect(items[0]?.querySelector("button")?.textContent).toBe("ACME-1");
    const bold = items[1]?.querySelector("strong button") as HTMLButtonElement;
    expect(bold.textContent).toBe("ACME-2");
    click(bold);
    expect(openAppLink).toHaveBeenCalledExactlyOnceWith("/ACME/issues/ACME-2");
  });
});
