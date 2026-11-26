import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  folder,
  inContainer,
  passes,
  radar,
  setup,
  trustedSettings,
} from "./trusted-runner.test-helper.ts";
import { IntegrationNotTrustedError } from "./trusted-runner-start.ts";

async function refusal(promise: Promise<unknown>): Promise<IntegrationNotTrustedError> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(IntegrationNotTrustedError);
  return error as IntegrationNotTrustedError;
}

verifies("app.trusted-runner-start", () => {
  describe("TrustedRunnerStart", () => {
    it("starts the runner through the gate when the trust covers the folder as it is", async () => {
      const { starts, started, startIn, trusted } = await setup();
      const start = await starts.start(radar(await trusted()), startIn);
      expect(start.run).toBe("fenced");
      expect(started.map((runner) => runner.startedIn)).toEqual(["fenced"]);
    });

    it("starts no process in a workspace that was never trusted (8a)", async () => {
      const { trust, starts, started, startIn, subject } = await setup();
      const check = await trust.check(await subject());
      expect(check.status).toBe("new");
      const error = await refusal(starts.start(radar(check), startIn));
      expect(error.reason).toBe("workspace-not-trusted");
      expect(started).toEqual([]);
    });

    it("starts nothing for a folder the trusted content doesn't name", async () => {
      const { starts, started, startIn, trusted } = await setup();
      const error = await refusal(
        starts.start(
          {
            trust: await trusted(),
            folder: "integrations/other",
            connector: "radar",
            settings: trustedSettings,
          },
          startIn,
        ),
      );
      expect(error.reason).toBe("not-in-trust");
      expect(started).toEqual([]);
    });

    it("starts nothing when one byte changed since the trust, even with the earlier check in hand", async () => {
      const { workspace, starts, started, startIn, trusted } = await setup();
      const check = await trusted();
      workspace.putFiles({ [`${folder}/src/index.js`]: "export default {};\r" });
      const error = await refusal(starts.start(radar(check), startIn));
      expect(error.reason).toBe("code-changed");
      expect(started).toEqual([]);
    });

    it("starts nothing when a link appeared in the folder since the trust (A12)", async () => {
      const { workspace, starts, started, startIn, trusted } = await setup();
      const check = await trusted();
      workspace.putLink(`${folder}/src/keys`);
      const error = await refusal(starts.start(radar(check), startIn));
      expect(error.reason).toBe("folder-refused");
      expect(error.problems).toEqual([expect.objectContaining({ code: "link", file: "src/keys" })]);
      expect(started).toEqual([]);
    });

    it("checks the folder again at every start, such as the restart after an idle stop", async () => {
      const { workspace, starts, started, startIn, trusted } = await setup();
      const check = await trusted();
      expect((await starts.start(radar(check), startIn)).run).toBe("fenced");
      workspace.putFiles({ [`${folder}/src/extra.js`]: "" });
      const error = await refusal(starts.start(radar(check), startIn));
      expect(error.reason).toBe("code-changed");
      expect(started).toHaveLength(1);
    });

    it("names the folder as the trust content does, a trailing slash or not", async () => {
      const { starts, startIn, trusted } = await setup();
      const start = await starts.start(
        {
          trust: await trusted(),
          folder: `${folder}/`,
          connector: "radar",
          settings: trustedSettings,
        },
        startIn,
      );
      expect(start.run).toBe("fenced");
    });

    it("starts nothing when a setting's address changed since the trust, even with the earlier check in hand", async () => {
      const { starts, started, startIn, trusted } = await setup();
      const check = await trusted();
      const error = await refusal(
        starts.start(
          {
            trust: check,
            folder,
            connector: "radar",
            settings: { url: "http://192.168.1.99:8123" },
          },
          startIn,
        ),
      );
      expect(error.reason).toBe("settings-changed");
      expect(started).toEqual([]);
    });

    it("starts with a setting still unset as trusted, and refuses it once set without a new trust", async () => {
      const { starts, started, startIn, trusted } = await setup(passes, {});
      const check = await trusted();
      if (check.status !== "trusted") throw new Error("expected a trusted check");
      expect(check.content.integrations?.[0]?.addresses).toEqual({ url: null });
      expect(
        (await starts.start({ trust: check, folder, connector: "radar", settings: {} }, startIn))
          .run,
      ).toBe("fenced");
      const error = await refusal(starts.start(radar(check), startIn));
      expect(error.reason).toBe("settings-changed");
      expect(started).toHaveLength(1);
    });

    it("takes the same trust whether the run is fenced or not: the fence status isn't in it", async () => {
      const { runs, starts, started, startIn, trusted } = await setup(inContainer);
      const check = await trusted();
      expect(await starts.start(radar(check), startIn)).toEqual({
        run: "needs-yes",
        reason: "container",
      });
      await runs.allow("container");
      expect((await starts.start(radar(check), startIn)).run).toBe("unfenced");
      expect(started.map((runner) => runner.startedIn)).toEqual(["launcher"]);
    });
  });
});
