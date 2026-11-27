// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { fullTime, shortTime } from "../text/short-time.ts";
import { FormatLocaleProvider, followedFormat, formatTag } from "./format-locale.tsx";
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
  vi.unstubAllEnvs();
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

  it("writes English the way a region in another language writes it, never mixing them", () => {
    expect(shortTime(at(2026, 11, 26, 9, 41), new Date(), "de-DE")).toBe("09:41");
    expect(shortTime(at(2026, 11, 23, 12, 0), new Date(), "de-DE")).toBe("Mon");
    expect(shortTime(at(2026, 11, 19, 12, 0), new Date(), "de-DE")).toBe("19 Nov");
    expect(shortTime(at(2026, 11, 19, 12, 0), new Date(), "nl")).toBe("19 Nov");
    expect(fullTime(at(2026, 11, 26, 9, 41), "de-DE")).toBe(
      fullTime(at(2026, 11, 26, 9, 41), "en-DE"),
    );
    expect(fullTime(at(2026, 11, 26, 9, 41), "de-DE")).toMatch(/^Thursday,? 26 November 2026/u);
  });

  it("writes a region Intl has no English for as en-GB, not as US English", () => {
    expect(shortTime(at(2026, 11, 26, 9, 41), new Date(), "pt-BR")).toBe("09:41");
    expect(shortTime(at(2026, 11, 19, 12, 0), new Date(), "pt-BR")).toBe("19 Nov");
  });

  it("counts calendar days across a change to summer time", () => {
    // In Amsterdam the clocks go forward on Sun 29 Mar 2026, so that day has 23 hours.
    vi.stubEnv("TZ", "Europe/Amsterdam");
    vi.setSystemTime(new Date("2026-03-30T08:00:00Z"));
    expect(shortTime(new Date("2026-03-28T11:00:00Z"), new Date(), "en-GB")).toBe("Sat");
    expect(shortTime(new Date("2026-03-29T21:30:00Z"), new Date(), "en-GB")).toBe("Yesterday");
  });

  it("writes the time in the zone the computer is in now, not the one its first time was in", () => {
    const moment = new Date("2026-11-26T08:41:00Z");
    vi.stubEnv("TZ", "Europe/London");
    expect(shortTime(moment, moment, "en-GB")).toBe("08:41");
    vi.stubEnv("TZ", "Europe/Amsterdam");
    expect(shortTime(moment, moment, "en-GB")).toBe("09:41");
    vi.stubEnv("TZ", "Pacific/Auckland");
    expect(fullTime(moment, "en-GB")).toMatch(/^Thursday,? 26 November 2026.*21:41$/u);
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

  it("shows nothing for an invalid time, rather than throw", () => {
    const { container } = render(
      <TimeStamp at={new Date("not a time")} now={new Date()} locale="en-GB" />,
    );
    expect(container.querySelector("time")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("follows the window's format when it isn't given one", () => {
    const { container } = render(
      <FormatLocaleProvider locale={formatTag("en_US.UTF-8")}>
        <TimeStamp at={at(2026, 11, 26, 9, 41)} now={new Date()} />
      </FormatLocaleProvider>,
    );
    expect(container.querySelector("time")?.textContent).toBe("9:41 AM");
  });

  it("gives a window in a region in another language English times in that region's way", () => {
    const { container } = render(
      <FormatLocaleProvider locale={followedFormat(undefined, "en_DE.UTF-8")}>
        <TimeStamp at={at(2026, 11, 26, 9, 41)} now={new Date()} />
        <TimeStamp at={at(2026, 11, 23, 9, 41)} now={new Date()} />
        <TimeStamp at={at(2026, 11, 26, 9, 41)} now={at(2026, 12, 5, 12, 0)} />
      </FormatLocaleProvider>,
    );
    const shown = [...container.querySelectorAll("time")].map((time) => time.textContent);
    expect(shown).toEqual(["09:41", "Mon", "26 Nov"]);
  });

  it("follows the format chosen in Settings → Formats over the computer's region", () => {
    expect(followedFormat("de-DE", "en_US.UTF-8")).toBe("de-DE");
    expect(followedFormat(undefined, "en_US.UTF-8")).toBe("en-US");
    const { container } = render(
      <FormatLocaleProvider locale={followedFormat("de-DE", "en_US.UTF-8")}>
        <TimeStamp at={at(2026, 11, 26, 9, 41)} now={new Date()} />
      </FormatLocaleProvider>,
    );
    expect(container.querySelector("time")?.textContent).toBe("09:41");
  });

  it("reads a system tag, and leaves one Intl can't read to the runtime", () => {
    expect(formatTag("en_GB.UTF-8")).toBe("en-GB");
    expect(formatTag("nl-NL")).toBe("nl-NL");
    expect(formatTag("C")).toBeUndefined();
    expect(formatTag(undefined)).toBeUndefined();
  });
});

verifies("kit.time-stamp-zone", () => {
  const evening = new Date("2026-11-25T23:30:00.000Z");
  const morning = new Date("2026-11-26T09:00:00.000Z");

  it("picks the day and writes the time in the given zone", () => {
    expect(shortTime(evening, morning, "en-GB", "Asia/Tokyo")).toBe("08:30");
    expect(shortTime(evening, morning, "en-GB", "UTC")).toBe("Yesterday");
    expect(shortTime(new Date("2025-11-20T12:00:00.000Z"), morning, "en-GB", "UTC")).toBe(
      "20/11/2025",
    );
  });
});
