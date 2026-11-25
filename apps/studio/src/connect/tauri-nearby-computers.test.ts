import type { NearbyComputer } from "@halonicjs/studio-feature-remote/phone";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { FakeShell } from "./fake-phone-shell.test-helper.ts";
import {
  readComputers,
  TauriNearbyComputers,
  tauriNearbyComputers,
} from "./tauri-nearby-computers.ts";

const browsing = { kind: "browsing" };
const laptop = { id: "nearby-AAAAAAAAAAAAAAAAAAAAAA", name: "Tim's laptop" };
const desktop = { id: "nearby-BBBBBBBBBBBBBBBBBBBBBB", name: "Attic desktop" };

function nearbyWith(answers: Record<string, unknown> = {}) {
  const shell = new FakeShell();
  for (const [command, answer] of Object.entries(answers)) shell.answers.set(command, answer);
  const reported: string[] = [];
  const lists: (readonly NearbyComputer[])[] = [];
  const nearby = new TauriNearbyComputers(shell, (line) => reported.push(line));
  const onChange = (computers: readonly NearbyComputer[]) => lists.push(computers);
  const send = (index: number, computers: object[]) =>
    shell.sendOn("phone_nearby_browse", index, { kind: "computers", computers });
  return { shell, reported, lists, nearby, onChange, send };
}

verifies("studio.connect.phone-nearby", () => {
  it("is there only inside the shell", () => {
    expect(tauriNearbyComputers(undefined, () => undefined)).toBeUndefined();
    expect(tauriNearbyComputers(new FakeShell(), () => undefined)).toBeInstanceOf(
      TauriNearbyComputers,
    );
  });

  it("holds the shell's first list until it answers browsing, then passes every list on", async () => {
    const { shell, lists, nearby, onChange, send } = nearbyWith({ phone_nearby_browse: browsing });
    const started = nearby.browse(onChange);
    send(0, []);
    expect(lists).toEqual([]);
    expect(await started).toEqual(browsing);
    send(1, [laptop, desktop]);
    expect(lists).toEqual([[], [desktop, laptop]]);
    expect(shell.calls[0]?.args?.["onEvent"]).toMatch(/^__CHANNEL__:\d+$/);
  });

  it("passes no list when Nearby devices is turned down or the search can't start", async () => {
    const turnedDown = { kind: "no-local-network", askAgain: true };
    const { shell, lists, nearby, onChange, send } = nearbyWith({
      phone_nearby_browse: turnedDown,
    });
    expect(await nearby.browse(onChange)).toEqual(turnedDown);
    shell.answers.set("phone_nearby_browse", { kind: "unavailable" });
    const started = nearby.browse(onChange);
    send(0, []);
    expect(await started).toEqual({ kind: "unavailable" });
    expect(lists).toEqual([]);
    expect(shell.openChannels()).toBe(0);
  });

  it("tells a browse stopped while Android asked nothing, and closes its channel", async () => {
    const { shell, lists, nearby, onChange, send } = nearbyWith({
      phone_nearby_browse: browsing,
      phone_nearby_stop: null,
    });
    const started = nearby.browse(onChange);
    await nearby.stop();
    expect(await started).toEqual(browsing);
    send(0, [laptop]);
    expect(lists).toEqual([]);
    expect(shell.commands()).toEqual(["phone_nearby_browse", "phone_nearby_stop"]);
    expect(shell.openChannels()).toBe(0);
  });

  it("drops the lists of a browse a newer one replaced", async () => {
    const { shell, nearby, send } = nearbyWith({ phone_nearby_browse: browsing });
    const first: (readonly NearbyComputer[])[] = [];
    await nearby.browse((computers) => first.push(computers));
    const older = shell.calls[0];
    if (older === undefined) throw new Error("no browse");
    await nearby.browse(() => undefined);
    // Send on the first browse's channel again, as a late list from the shell would come.
    shell.calls.push(older);
    send(0, [laptop]);
    expect(first).toEqual([]);
  });

  it("reads an answer it doesn't know as unavailable, and drops a list it doesn't know", async () => {
    const { reported, lists, nearby, onChange, send } = nearbyWith({
      phone_nearby_browse: { kind: "browsing", extra: 1 },
    });
    expect(await nearby.browse(onChange)).toEqual({ kind: "unavailable" });
    expect(
      readComputers({ kind: "computers", computers: [{ ...laptop, port: 4100 }] }, (line) =>
        reported.push(line),
      ),
    ).toBeUndefined();
    send(0, []);
    expect(lists).toEqual([]);
    expect(reported).toEqual([
      "phone_nearby_browse gave an answer the page doesn't know",
      "phone_nearby_browse sent a list the page doesn't know",
    ]);
  });

  it("checks every list again: names trimmed and not empty, at most 64 bytes, at most 20", () => {
    const many = Array.from({ length: 24 }, (_, index) => ({
      id: `nearby-${index}`,
      name: `Computer ${String(index).padStart(2, "0")}`,
    }));
    const odd = [
      { id: "nearby-blank", name: "  " },
      { id: "nearby-long", name: "é".repeat(32) + "x" },
      { id: "", name: "No id" },
      { id: "nearby-trim", name: "  Attic desktop " },
    ];
    const read = readComputers(
      { kind: "computers", computers: [...odd, ...many] },
      () => undefined,
    );
    expect(read).toHaveLength(20);
    expect(read?.[0]).toEqual({ id: "nearby-trim", name: "Attic desktop" });
    expect(read?.at(-1)?.name).toBe("Computer 18");
  });

  it("rejects when the shell refuses the browse, and leaves no channel open", async () => {
    const { shell, nearby, onChange } = nearbyWith();
    await expect(nearby.browse(onChange)).rejects.toBe("command phone_nearby_browse not allowed");
    expect(shell.openChannels()).toBe(0);
  });
});
