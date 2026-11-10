import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type PluginSettingField, settingValueProblem } from "./setting-values.ts";

const base = { label: "A setting", required: false };

verifies("format.plugin-setting-values", () => {
  it("takes a value of the setting's type, and says what to use otherwise", () => {
    const fields: [PluginSettingField, unknown, unknown][] = [
      [{ ...base, type: "text" }, "Ghent", 3],
      [{ ...base, type: "url" }, "https://example.com/feed", "ftp://example.com"],
      [{ ...base, type: "number" }, 3, "3"],
      [{ ...base, type: "boolean" }, false, "false"],
    ];
    for (const [field, good, bad] of fields) {
      expect(settingValueProblem(field, good)).toBeNull();
      expect(settingValueProblem(field, bad)).toMatch(/^use /u);
    }
    expect(settingValueProblem({ ...base, type: "number" }, Number.NaN)).toBe("use a number");
    expect(settingValueProblem({ ...base, type: "url" }, "ftp://example.com")).toContain(
      "http or https",
    );
  });

  it("takes only one of a choice setting's choices, and names them", () => {
    const field: PluginSettingField = { ...base, type: "choice", choices: ["metric", "imperial"] };
    expect(settingValueProblem(field, "metric")).toBeNull();
    expect(settingValueProblem(field, "kelvin")).toBe("use one of 'metric', 'imperial'");
  });

  it("refuses every value for a secret setting", () => {
    const field: PluginSettingField = { ...base, type: "secret", secret: "weather-key" };
    expect(settingValueProblem(field, "a value")).toContain("kept in Secrets");
  });
});
