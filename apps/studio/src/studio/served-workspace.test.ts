// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadServedWorkspace } from "./served-workspace.ts";
import { type StartedStudio, startStudio } from "./start-studio.ts";

const acme = { name: "Acme", sample: false, folder: "~/Projects/acme" };
const ask = (response: () => Response) => async () => response();

verifies("studio.served-workspace", () => {
  describe("loadServedWorkspace", () => {
    it("asks /api/workspace and gives the three fields", async () => {
      const paths: string[] = [];
      const workspace = await loadServedWorkspace(async (path) => {
        paths.push(path);
        return Response.json(acme);
      });
      expect(paths).toEqual(["/api/workspace"]);
      expect(workspace).toEqual(acme);
    });

    it.each([
      ["a refusal", () => new Response("{}", { status: 401 })],
      ["a page that isn't JSON", () => new Response("<html></html>")],
      ["a missing field", () => Response.json({ name: "Acme", sample: false })],
      ["an extra field", () => Response.json({ ...acme, path: "acme" })],
      ["a wrong type", () => Response.json({ ...acme, sample: "no" })],
    ])("rejects %s", async (_what, response) => {
      await expect(loadServedWorkspace(ask(response))).rejects.toThrow();
    });
  });

  describe("the served page", () => {
    let element: HTMLElement;
    let started: StartedStudio | undefined;
    beforeEach(() => {
      element = document.createElement("div");
      document.body.append(element);
    });
    afterEach(async () => {
      await started?.stop();
      started = undefined;
      element.remove();
    });

    it("draws no window when it is stopped before the computer answers", async () => {
      let answer: (response: Response) => void = () => {};
      started = startStudio({
        element,
        window,
        userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
        fetch: () => new Promise<Response>((resolve) => (answer = resolve)),
      });
      await started.stop();
      answer(Response.json(acme));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(element.childElementCount).toBe(0);
    });
  });
});
