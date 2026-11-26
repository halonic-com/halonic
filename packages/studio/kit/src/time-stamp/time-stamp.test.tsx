// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { fullTime, shortTime } from "../text/short-time.ts";
import { FormatLocale, formatTag } from "./format-locale.ts";
import { TimeStamp } from "./time-stamp.tsx";

// Local times, so the test reads the same in every time zone. `now` is the faked clock.
const at = (year: number, month: number, day: number, hours: number, minutes: number) =>
  new Date(year, month - 1, day, hours, minutes);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at(2026, 11, 26, 9, 41));
});

afterEach(() => {
  unmountAll();
  vi.useRealTimers();
});

verifies("kit.time-stamp", () => {
  it("says the time today, from midnight on", () => {
    expect(shortTime(at(2026, 11, 26, 9, 41), new Date(), "en-GB")).toBe("09:41");
    expect(shortTime(at(2026, 11, 26, 0, 0), new Date(), "en-GB")).toBe("00:00");
  });

  it("says Yesterday for the day before, up to its last minute", () => {
    expect(shortTime(at(2026, 11, 25, 23, 59), new Date(), "en-GB")).toBe("Yesterday");
    expect(shortTime(at(2026, 11, 25, 0, 0), new Date(), "en-GB")).toBe("Yesterday");
  });

  it("names the weekday within the last week, then the day and month", () => {
    expect(shortTime(at(2026, 11, 24, 12, 0), new Date(), "en-GB")).toBe("Tue");
    expect(shortTime(at(2026, 11, 20, 12, 0), new Date(), "en-GB")).toBe("Fri");
    expect(shortTime(at(2026, 11, 19, 23, 59), new Date(), "en-GB")).toBe("19 Nov");
    expect(shortTime(at(2026, 1, 1, 0, 0), new Date(), "en-GB")).toBe("1 Jan");
  });

  it("gives the short date before this year, and across the change of year", () => {
    expect(shortTime(at(2025, 11, 26, 9, 41), new Date(), "en-GB")).toBe("26/11/2025");
    vi.setSystemTime(at(2027, 1, 2, 10, 0));
    expect(shortTime(at(2027, 1, 1, 0, 0), new Date(), "en-GB")).toBe("Yesterday");
    expect(shortTime(at(2026, 12, 30, 18, 0), new Date(), "en-GB")).toBe("Wed");
    expect(shortTime(at(2026, 12, 20, 18, 0), new Date(), "en-GB")).toBe("20/12/2026");
  });

  it("follows the locale's clock and day order", () => {
    expect(shortTime(at(2026, 11, 26, 9, 41), new Date(), "en-US")).toBe("9:41 AM");
    expect(shortTime(at(2026, 11, 19, 12, 0), new Date(), "en-US")).toBe("Nov 19");
    expect(shortTime(at(2025, 11, 26, 9, 41), new Date(), "en-US")).toBe("11/26/2025");
  });

  it("reads a time later than now as its day", () => {
    expect(shortTime(at(2026, 11, 27, 8, 0), new Date(), "en-GB")).toBe("27 Nov");
  });

  it("shows the short time, muted and unwrapped, with the full date and time on hover", () => {
    const moment = at(2026, 11, 26, 9, 41);
    const { container } = render(<TimeStamp at={moment} now={new Date()} locale="en-GB" />);
    const time = container.querySelector("time");
    expect(time?.textContent).toBe("09:41");
    expect(time?.getAttribute("dateTime")).toBe(moment.toISOString());
    expect(time?.getAttribute("title")).toBe(fullTime(moment, "en-GB"));
    expect(fullTime(moment, "en-GB")).toMatch(/^Thursday,? 26 November 2026.*09:41$/u);
    expect(time?.className).toContain("shrink-0 whitespace-nowrap text-small text-fg-muted");
    expect(time?.className).toContain("tabular-nums");
  });

  it("follows the window's format when it isn't given one", () => {
    const { container } = render(
      <FormatLocale value={formatTag("en_US.UTF-8")}>
        <TimeStamp at={at(2026, 11, 26, 9, 41)} now={new Date()} />
      </FormatLocale>,
    );
    expect(container.querySelector("time")?.textContent).toBe("9:41 AM");
  });

  it("reads a system tag, and leaves one Intl can't read to the runtime", () => {
    expect(formatTag("en_GB.UTF-8")).toBe("en-GB");
    expect(formatTag("nl-NL")).toBe("nl-NL");
    expect(formatTag("C")).toBeUndefined();
    expect(formatTag(undefined)).toBeUndefined();
  });
});
