import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { exampleFlow } from "./fake-flow.test-helper.ts";
import { signInName } from "./fake-integration.test-helper.ts";

verifies("integration-sign-in.sign-in-flow", () => {
  it("says cancelled when the user refused, and its page says they cancelled it", async () => {
    const test = exampleFlow();
    const started = await test.started();

    const response = await test.flow.handleCallback(
      started.callback({ state: started.state, error: "access_denied" }),
    );

    expect(test.outcomes).toEqual([{ kind: "cancelled", signIn: signInName }]);
    expect(test.seen).toEqual([]);
    expect(response.status).toBe(400);
    expect(await response.text()).toContain(
      "You cancelled the sign-in. You can close this tab and go back to Halonic.",
    );
  });

  it("exchanges nothing for a sign-in that was cancelled, and its page says it was cancelled in Halonic", async () => {
    const test = exampleFlow();
    const started = await test.started();

    test.flow.cancel(signInName);
    const response = await test.flow.handleCallback(
      started.callback({ state: started.state, code: "c" }),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toContain(
      "This sign-in was cancelled in Halonic, so nothing was saved. You can close this tab. To sign in, go back to Halonic and choose Sign in.",
    );
    expect(test.seen).toEqual([]);
    expect(test.outcomes).toEqual([{ kind: "cancelled", signIn: signInName }]);
  });

  it("answers a cancelled sign-in's path with the plain 400 once its wait is over or it starts again", async () => {
    const test = exampleFlow();
    const expired = await test.started();
    test.flow.cancel(signInName);
    test.wait(11 * 60 * 1000);
    const replaced = await test.started();
    test.flow.cancel(signInName);
    await test.started();

    for (const started of [expired, replaced]) {
      const response = await test.flow.handleCallback(
        started.callback({ state: started.state, code: "c" }),
      );
      expect(response.status).toBe(400);
      expect(await response.text()).toContain("This sign-in link is no longer valid.");
    }
    expect(test.seen).toEqual([]);
  });

  it("says nothing when Cancel finds no pending sign-in", async () => {
    const test = exampleFlow();
    const signedIn = await test.started();
    await test.flow.handleCallback(signedIn.callback({ state: signedIn.state, code: "fake-code" }));
    const expired = await test.started();
    test.wait(11 * 60 * 1000);

    test.flow.cancel(signInName);
    test.flow.cancel("other");

    expect(test.outcomes.map((outcome) => outcome.kind)).toEqual(["signedIn"]);
    expect(test.flow.handlesPath(expired.callbackPath)).toBe(false);
  });
});
