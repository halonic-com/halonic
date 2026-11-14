import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { isRetryable, RemoteHostError } from "./errors.ts";
import { errorBody, fakeHost, loginResponse, summaryOf } from "./fake-host.test-helper.ts";
import { createRemoteExecutor } from "./remote-executor.ts";

const baseUrl = "http://127.0.0.1:4173";

/** A host that wants the session cookie `halonic-session=session-1`. */
function hostWithPassword(password: string) {
  return fakeHost(async (call) => {
    if (call.path === "/api/login") {
      return (call.body as { password?: string }).password === password
        ? loginResponse()
        : errorBody(401, "wrong_password", "The password is wrong.");
    }
    return call.headers.get("cookie") === "halonic-session=session-1"
      ? Response.json(summaryOf("run_1"))
      : errorBody(401, "not_signed_in", "Sign in first.");
  });
}

verifies("executor-remote.session", () => {
  describe("sign-in", () => {
    it("signs in on a 401, repeats the call with the cookie and keeps the cookie", async () => {
      const host = hostWithPassword("open sesame");
      const executor = createRemoteExecutor({
        baseUrl,
        password: "open sesame",
        fetch: host.fetch,
        reportError: () => {},
      });

      await executor.send("run_1", "approve");
      await executor.send("run_1", "approve");

      expect(host.calls.map((call) => call.path)).toEqual([
        "/api/runs/run_1/events",
        "/api/login",
        "/api/runs/run_1/events",
        "/api/runs/run_1/events",
      ]);
    });

    it("shares one login between calls that wait at the same time", async () => {
      const host = hostWithPassword("open sesame");
      const executor = createRemoteExecutor({
        baseUrl,
        password: "open sesame",
        fetch: host.fetch,
        reportError: () => {},
      });

      await Promise.all([
        executor.send("run_1", "approve"),
        executor.send("run_2", "approve"),
        executor.cancel?.("run_3"),
      ]);

      expect(host.calls.filter((call) => call.path === "/api/login")).toHaveLength(1);
    });

    it("rejects with the host's code on a wrong password and never repeats the password", async () => {
      const host = hostWithPassword("open sesame");
      const executor = createRemoteExecutor({
        baseUrl,
        password: "hunter2-wrong",
        fetch: host.fetch,
        reportError: () => {},
      });

      const error = await executor.send("run_1", "approve").catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(RemoteHostError);
      expect((error as RemoteHostError).code).toBe("wrong_password");
      expect(String(error)).not.toContain("hunter2-wrong");
    });

    it("rejects when the host's login sends no session", async () => {
      const host = fakeHost((call) =>
        call.path === "/api/login"
          ? Response.json({ signedIn: true })
          : errorBody(401, "not_signed_in"),
      );
      const executor = createRemoteExecutor({
        baseUrl,
        password: "pw",
        fetch: host.fetch,
        reportError: () => {},
      });

      await expect(executor.send("run_1", "approve")).rejects.toMatchObject({
        code: "unexpected_response",
      });
    });

    it("does not sign in, and surfaces the 401, when it has no password", async () => {
      const host = hostWithPassword("open sesame");
      const executor = createRemoteExecutor({ baseUrl, fetch: host.fetch, reportError: () => {} });

      await expect(executor.send("run_1", "approve")).rejects.toMatchObject({
        code: "not_signed_in",
        status: 401,
      });
      expect(host.calls.map((call) => call.path)).toEqual(["/api/runs/run_1/events"]);
    });

    it("ignores a cookie the host ends", async () => {
      const host = fakeHost((call) => {
        if (call.path !== "/api/login") return errorBody(401, "not_signed_in");
        const response = Response.json({});
        response.headers.append("Set-Cookie", "halonic-session=; Max-Age=0");
        return response;
      });
      const executor = createRemoteExecutor({
        baseUrl,
        password: "pw",
        fetch: host.fetch,
        reportError: () => {},
      });

      await expect(executor.send("run_1", "approve")).rejects.toMatchObject({
        code: "unexpected_response",
      });
    });

    it("gives up on a sign-in the host never answers, as a try that can be repeated", async () => {
      const fetcher = (request: Request) =>
        new Promise<Response>((resolve, reject) => {
          if (new URL(request.url).pathname !== "/api/login") {
            resolve(errorBody(401, "not_signed_in"));
            return;
          }
          request.signal.addEventListener("abort", () => reject(request.signal.reason));
        });
      const executor = createRemoteExecutor({
        baseUrl,
        password: "pw",
        fetch: fetcher,
        loginTimeoutMs: 20,
        reportError: () => {},
      });

      const error = await executor.send("run_1", "approve").catch((thrown: unknown) => thrown);

      expect((error as Error).name).toBe("TimeoutError");
      expect(isRetryable(error)).toBe(true);
    });
  });

  describe("a password over plain http", () => {
    const open =
      (url: string, extra: { allowPlainHttp?: boolean } = {}) =>
      () =>
        createRemoteExecutor({
          baseUrl: url,
          password: "pw",
          reportError: () => {},
          ...extra,
        });

    it("is refused for a host that isn't loopback", () => {
      expect(open("http://halonic.example:4173")).toThrow(RangeError);
      expect(open("http://192.168.1.5")).toThrow(RangeError);
    });

    it("is allowed on loopback and over https", () => {
      for (const url of [
        "http://127.0.0.1:4173",
        "http://localhost:4173",
        "http://[::1]:4173",
        "https://halonic.example",
      ]) {
        expect(open(url)).not.toThrow();
      }
    });

    it("is allowed when the caller says so, and a host without password needs no say", () => {
      expect(open("http://halonic.example", { allowPlainHttp: true })).not.toThrow();
      expect(() =>
        createRemoteExecutor({ baseUrl: "http://halonic.example", reportError: () => {} }),
      ).not.toThrow();
    });

    it("never puts the password in the refusal", () => {
      expect(() => open("http://halonic.example")()).toThrow(/^(?!.*\bpw\b)/);
    });
  });
});
