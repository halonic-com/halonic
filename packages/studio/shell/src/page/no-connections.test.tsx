// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import { connectFrom, NoConnections } from "./no-connections.tsx";

afterEach(unmountAll);

const line = "Connect Paperclip to see who works on what and which work is blocked.";

verifies("shell.no-connections", () => {
  it("says No connections and the place's line, and opens Settings › Connections", async () => {
    const openSettings = vi.fn();
    const context = { openSettings } as unknown as WorkspaceContext;
    const container = render(<NoConnections line={line} onConnect={connectFrom(context)} />);

    expect(container.querySelector("h2")?.textContent).toBe("No connections");
    expect(container.textContent).toContain(line);
    const connect = container.querySelector("button") as HTMLButtonElement;
    expect(connect.textContent).toBe("Connect Paperclip");
    await act(async () => connect.click());
    expect(openSettings).toHaveBeenCalledWith("connections");
  });

  it("has no button when the window can't open Settings", () => {
    const context = {} as WorkspaceContext;
    const container = render(<NoConnections line={line} onConnect={connectFrom(context)} />);

    expect(container.textContent).toBe(`No connections${line}`);
    expect(container.querySelector("button")).toBeNull();
  });
});
