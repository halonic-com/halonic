// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ResourceStatusItem } from "./resource-status-item.tsx";
import { type ResourceWatch, watchResources } from "./resource-watch.ts";
import { freeSpaceText, memoryText } from "./resource-words.ts";

const megabyte = 1024 ** 2;
const gigabyte = 1024 ** 3;

let timers: FakeTimers;
let report: { engine: number; child: number; free: number };
let reads: number;
let watch: ResourceWatch | undefined;

beforeEach(() => {
  timers = new FakeTimers();
  report = { engine: 150 * megabyte, child: 80 * megabyte, free: 48 * gigabyte };
  reads = 0;
});

/** Starts a watch on the current `report`: it reads at once, as the shell's does. */
function startWatch(): ResourceWatch {
  watch = watchResources({
    timers,
    onError: (error) => {
      throw error;
    },
    read: async () => {
      reads += 1;
      return {
        engineMemoryBytes: report.engine,
        childProcesses: [{ name: "harness", memoryBytes: report.child }],
        dataBytes: 0,
        freeDiskBytes: report.free,
      };
    },
  });
  return watch;
}

afterEach(() => {
  watch?.stop();
  unmountAll();
  vi.restoreAllMocks();
});

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

async function renderItem(): Promise<HTMLElement> {
  const container = render(<ResourceStatusItem watch={startWatch()} timers={timers} />);
  await settle();
  return container;
}

/** The item's visible text, without the screen reader copy. */
function visibleText(container: HTMLElement): string {
  return container.querySelector('span[aria-hidden="true"]:not([class])')?.textContent ?? "";
}

verifies("shell.resource-status-item", () => {
  it("says memory and free space in plain text, with its name as the tooltip", async () => {
    const container = await renderItem();
    const item = container.firstElementChild as HTMLElement;
    expect(visibleText(container)).toBe("230 MB · 48 GB free");
    expect(item.title).toBe("Halonic uses 230 MB of memory. 48 GB free on this disk.");
    expect(item.querySelector(".sr-only")?.textContent).toBe(item.title);
    expect(container.querySelector("button, a, [tabindex]")).toBeNull();
  });

  it("shows nothing until a reading arrives", () => {
    const container = render(<ResourceStatusItem watch={startWatch()} timers={timers} />);
    expect(container.textContent).toBe("");
  });

  it("turns into the low-disk warning below 1 GB free and back, without a reload", async () => {
    report.free = 0.8 * gigabyte;
    const container = await renderItem();
    expect(visibleText(container)).toBe("Low on disk space: 0.8 GB free");
    expect((container.firstElementChild as HTMLElement).className).toContain("text-warning");
    expect((container.firstElementChild as HTMLElement).title).toBe(
      "Low on disk space: 0.8 GB free. Free some space so runs can write their logs.",
    );
    report.free = 12 * gigabyte;
    await act(async () => timers.advance(30_000));
    await settle();
    expect(visibleText(container)).toBe("230 MB · 12 GB free");
  });

  it("reads 'less than 0.1 GB' near zero, never 0.0 GB", async () => {
    report.free = 0.04 * gigabyte;
    const container = await renderItem();
    expect(visibleText(container)).toBe("Low on disk space: less than 0.1 GB free");
  });

  it("reads the report again every 30 s and when the window comes to the front", async () => {
    await renderItem();
    const before = reads;
    await act(async () => timers.advance(30_000));
    await settle();
    expect(reads).toBe(before + 1);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await settle();
    expect(reads).toBe(before + 2);
  });

  it("shows from 900px, and only the normal item gives way to a Restart to update item", async () => {
    const normal = await renderItem();
    const normalClasses = (normal.firstElementChild as HTMLElement).className;
    expect(normalClasses).toContain("hidden");
    expect(normalClasses).toContain("wide:inline");
    expect(normalClasses).toContain("max-[1199px]:group-has-[[data-status-update]]/bar:hidden");
    unmountAll();
    watch?.stop();
    report.free = 0.8 * gigabyte;
    const low = await renderItem();
    expect((low.firstElementChild as HTMLElement).className).toContain("wide:flex");
    expect((low.firstElementChild as HTMLElement).className).not.toContain("group-has");
  });
});

verifies("shell.resource-status-item", () => {
  it("words memory in MB below 1 GB and in GB from 1 GB", () => {
    expect(memoryText(230 * megabyte)).toBe("230 MB");
    expect(memoryText(1.2 * gigabyte)).toBe("1.2 GB");
  });

  it("never words memory as 1024 MB", () => {
    expect(memoryText(1023.7 * megabyte)).toBe("1.0 GB");
    expect(memoryText(1023.4 * megabyte)).toBe("1023 MB");
  });

  it("words free space in whole GB, with one decimal below 10 GB", () => {
    expect(freeSpaceText(48.3 * gigabyte)).toBe("48 GB");
    expect(freeSpaceText(7.44 * gigabyte)).toBe("7.4 GB");
    expect(freeSpaceText(0.04 * gigabyte)).toBe("less than 0.1 GB");
  });

  it("rounds free space down so it never contradicts the thresholds", () => {
    expect(freeSpaceText(0.96 * gigabyte)).toBe("0.9 GB");
    expect(freeSpaceText(9.96 * gigabyte)).toBe("9.9 GB");
    expect(freeSpaceText(10.9 * gigabyte)).toBe("10 GB");
  });
});
