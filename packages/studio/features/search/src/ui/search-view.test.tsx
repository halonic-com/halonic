// @vitest-environment jsdom
import type { SearchHit } from "@halonicjs/ports";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { SearchStore } from "../search-store.ts";
import { SearchView } from "./search-view.tsx";

// Tells React this is a test, so it checks that updates happen inside act().
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

verifies("search.across-sources", () => {
  it("draws hits by kind and source as plain text, and opens the one picked", async () => {
    const messaging = new FakeAgentMessaging();
    const acme = messaging.addSource({ label: "Paperclip · Acme" });
    const chief = messaging.addAgent(acme.id, {
      name: "Chief",
      title: "<img src=x onerror=alert(1)>",
    });
    messaging.addWork(acme.id, { label: "ACME-1", title: "Chief's launch plan" });
    const store = new SearchStore(messaging);
    const opened: SearchHit[] = [];
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () =>
      root.render(<SearchView store={store} onOpen={(hit) => opened.push(hit)} />),
    );

    await act(async () => store.search("chief"));

    const headings = [...container.querySelectorAll("h2")].map((heading) => heading.textContent);
    expect(headings).toEqual(["Agents", "Work"]);
    expect(container.querySelectorAll("h3")[0]?.textContent).toBe("Paperclip · Acme");
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(container.querySelector("img")).toBeNull();
    act(() => container.querySelector<HTMLButtonElement>("[data-kind=agent] button")?.click());
    expect(opened.map((hit) => hit.id)).toEqual([chief.id]);

    await act(async () => store.search("nobody"));
    expect(container.textContent).toContain("Nothing matches “nobody”.");
    act(() => root.unmount());
    container.remove();
  });
});
