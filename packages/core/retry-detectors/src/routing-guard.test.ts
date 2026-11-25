import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { opusOnlyLabels, routeForTask } from "./routing-guard.ts";

verifies("retry-detectors.routing-guard", () => {
  describe("routeForTask", () => {
    it("allows open models for an ordinary task on one public repository", () => {
      expect(routeForTask({ labels: ["D2", "docs"], repositories: ["public"] })).toEqual({
        route: "open-model-allowed",
      });
    });

    it.each([...opusOnlyLabels])("keeps a task labelled %s on Opus", (label) => {
      expect(routeForTask({ labels: ["D1", label], repositories: ["public"] })).toEqual({
        route: "opus",
        reasons: ["opus-only-area"],
      });
    });

    it("reads labels regardless of case and surrounding spaces", () => {
      expect(routeForTask({ labels: [" Sandbox "], repositories: ["public"] })).toEqual({
        route: "opus",
        reasons: ["opus-only-area"],
      });
    });

    it.each(["private", "internal", "unknown"] as const)(
      "keeps a task on Opus when one repository is %s",
      (visibility) => {
        expect(routeForTask({ labels: ["D1"], repositories: ["public", visibility] })).toEqual({
          route: "opus",
          reasons: ["non-public-repository"],
        });
      },
    );

    it("keeps a task without any repository on Opus", () => {
      expect(routeForTask({ labels: ["D1"], repositories: [] })).toEqual({
        route: "opus",
        reasons: ["no-repository"],
      });
    });

    it("lists every reason that applies", () => {
      expect(routeForTask({ labels: ["opus-only"], repositories: ["private"] })).toEqual({
        route: "opus",
        reasons: ["opus-only-area", "non-public-repository"],
      });
    });
  });
});
