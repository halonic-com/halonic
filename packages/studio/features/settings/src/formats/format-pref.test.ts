import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { DisplaySettings } from "../display-settings.ts";
import { MemoryDisplayPrefs } from "../test-support/memory-display-prefs.ts";
import {
  formatExample,
  formatLocale,
  formatOptions,
  formatPref,
  formatTags,
  usableTag,
} from "./format-pref.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

function stored(value: unknown) {
  const prefs = new MemoryDisplayPrefs();
  prefs.stored.set(formatPref.key, value);
  return new DisplaySettings(prefs).get(formatPref);
}

verifies("settings.formats-format", () => {
  it("lists Follow this computer first, with the followed format's name", () => {
    const [first] = formatOptions({ followTag: "en-GB", place: "app" });
    expect(first).toEqual({
      value: "follow",
      label: "Follow this computer: English (United Kingdom)",
    });
  });

  it("says Follow this browser when served", () => {
    const [first] = formatOptions({ followTag: "nl-NL", place: "served" });
    expect(first?.label).toBe("Follow this browser: Dutch (Netherlands)");
  });

  it("lists the tags by their English names, sorted by name", () => {
    const options = formatOptions({ followTag: "en-GB", place: "app" }).slice(1);
    const labels = options.map((option) => option.label);
    expect(labels).toEqual([...labels].sort((left, right) => left.localeCompare(right, "en")));
    expect(options).toContainEqual({ value: "nl-NL", label: "Dutch (Netherlands)" });
    expect(options).toContainEqual({ value: "en-US", label: "English (United States)" });
    expect(options).toHaveLength(formatTags.length);
  });

  it("leaves out a tag the window can't format", () => {
    const supported = Intl.DateTimeFormat.supportedLocalesOf;
    vi.spyOn(Intl.DateTimeFormat, "supportedLocalesOf").mockImplementation((tags) =>
      supported([tags ?? []].flat().filter((tag) => tag !== "ja-JP")),
    );
    const values = formatOptions({ followTag: "en-GB", place: "app" }).map(
      (option) => option.value,
    );
    expect(values).not.toContain("ja-JP");
    expect(values).toContain("nl-NL");
  });

  it("shows a number and a date in the format, with no currency", () => {
    expect(formatExample("en-GB")).toBe("45.00 · Mon 9 Nov, 08:00");
    expect(formatExample("nl-NL")).toBe("45,00 · ma 9 nov, 08:00");
  });

  it("formats with the followed tag, or the chosen one", () => {
    expect(formatLocale("follow", "en-GB")).toBe("en-GB");
    expect(formatLocale("nl-NL", "en-GB")).toBe("nl-NL");
  });

  it("reads a system LANG or a tag with extensions as a plain tag", () => {
    expect(usableTag("en_GB.UTF-8")).toBe("en-GB");
    expect(usableTag("en_GB")).toBe("en-GB");
    expect(usableTag("en-GB-u-ca-buddhist")).toBe("en-GB");
    expect(formatOptions({ followTag: "en_GB", place: "app" })[0]?.label).toBe(
      "Follow this computer: English (United Kingdom)",
    );
    expect(formatExample("en-GB-u-ca-buddhist")).toBe("45.00 · Mon 9 Nov, 08:00");
    expect(formatLocale("follow", "nl_NL.UTF-8")).toBe("nl-NL");
  });

  it("follows this window's own format when the followed tag can't be read", () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      ...new Intl.DateTimeFormat("en-GB").resolvedOptions(),
      locale: "en-GB",
    });
    expect(usableTag("")).toBe("en-GB");
    expect(usableTag("C")).toBe("en-GB");
    expect(formatOptions({ followTag: "", place: "app" })[0]?.label).toBe(
      "Follow this computer: English (United Kingdom)",
    );
    expect(formatExample("")).toBe("45.00 · Mon 9 Nov, 08:00");
  });

  it("stores the tag, and follows the computer for anything else", () => {
    expect(stored("nl-NL")).toBe("nl-NL");
    expect(stored("follow")).toBe("follow");
    expect(stored("Dutch (Netherlands)")).toBe("follow");
    expect(stored(undefined)).toBe("follow");
  });
});
