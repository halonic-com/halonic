// @vitest-environment jsdom
import type { ConnectorTrouble } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { ConnectorStatus, ConnectorStatusHost } from "../connector-status-host.ts";
import { ConnectorStatusModel } from "../connector-status-model.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ConnectorStatusSection } from "./connector-status-section.tsx";

afterEach(unmountAll);

function orders(trouble: ConnectorTrouble): ConnectorStatus {
  return {
    id: "orders",
    name: "Shop orders",
    state: "connected",
    reason: "",
    connection: { kind: "integration", folder: "shop-orders" },
    trouble,
  };
}

async function openSection(connector: ConnectorStatus, onLook?: (ask: string) => void) {
  const host: ConnectorStatusHost = {
    list: async () => [connector],
    refusals: async () => [],
    waiting: async () => [],
    subscribe: () => () => {},
  };
  const root = render(
    <ConnectorStatusSection
      model={new ConnectorStatusModel(host, "orders")}
      {...(onLook === undefined ? {} : { onLook })}
    />,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return root;
}

const look = (root: HTMLElement) =>
  [...root.querySelectorAll("button")].find(
    (button) => button.textContent === "Let the assistant look",
  );

verifies("library.connector-trouble-line", () => {
  it("shows a changed reply as one line, with the fields in code type", async () => {
    const trouble = {
      kind: "reply-changed",
      host: "shop.example.com",
      fields: ["fulfillment", "{…}"],
    } as const;
    const root = await openSection(orders(trouble), () => {});
    expect(root.textContent).toContain(
      "shop.example.com answered differently than before (the fulfillment and {…} fields are gone).",
    );
    const code = [...root.querySelectorAll("code")].map((part) => part.textContent);
    expect(code).toEqual(["shop.example.com", "fulfillment", "{…}"]);
  });

  it("opens a Build chat that holds the folder, the kind and the cleaned fields, and no reply", async () => {
    const onLook = vi.fn<(ask: string) => void>();
    const trouble = { kind: "reply-changed", host: "shop.example.com", fields: ["{…}"] } as const;
    const root = await openSection(orders(trouble), onLook);
    act(() => look(root)?.click());
    expect(onLook).toHaveBeenCalledOnce();
    const ask = onLook.mock.calls[0]?.[0] ?? "";
    expect(ask).toContain("Integration: `integrations/shop-orders`");
    expect(ask).toContain("Trouble: `reply-changed`");
    expect(ask).toContain("Fields: `{…}`");
    expect(ask).not.toContain("<b>");
  });

  it.each([
    ["not-accepted", "shop.example.com didn't accept the token. It may be mistyped or revoked."],
    [
      "not-allowed",
      "Your token isn't allowed to do this. Check its permissions at shop.example.com.",
    ],
    ["slow-down", "shop.example.com asked Halonic to slow down. Try again in a few minutes."],
  ] as const)("shows %s as its line, with no Let the assistant look", async (kind, line) => {
    const root = await openSection(
      orders({ kind, host: "shop.example.com", fields: [] }),
      () => {},
    );
    expect(root.textContent).toContain(line);
    expect(look(root)).toBeUndefined();
  });

  it("offers Let the assistant look for a 404, and names the connector when the log names no host", async () => {
    const root = await openSection(orders({ kind: "not-found", host: "", fields: [] }), () => {});
    expect(root.textContent).toContain(
      "Shop orders couldn't find what Shop orders asked for. The service may have changed.",
    );
    expect(look(root)).toBeDefined();
  });

  it("shows no button when no chat can open", async () => {
    const root = await openSection(
      orders({ kind: "not-found", host: "a.example.com", fields: [] }),
    );
    expect(look(root)).toBeUndefined();
  });
});
