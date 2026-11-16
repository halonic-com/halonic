import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeShell } from "./fake-shell.test-helper.ts";
import { ShellHttpClient, shellHttpClient } from "./shell-http-client.ts";

const answer = (over: Record<string, unknown> = {}) => ({
  status: 200,
  headers: [["content-type", "application/json"]],
  body: '{"ok":true}',
  url: "https://api.example.com/v1",
  ...over,
});

verifies("services.shell-http-client", () => {
  describe("ShellHttpClient", () => {
    it("sends the method, address, headers and string body to http_fetch and returns the answer", async () => {
      const shell = new FakeShell().answer("http_fetch", () => answer());

      const response = await new ShellHttpClient(shell).fetch("https://api.example.com/v1", {
        method: "POST",
        headers: { Authorization: "Bearer k" },
        body: "{}",
      });

      expect(response.status).toBe(200);
      expect(response.ok).toBe(true);
      expect(response.url).toBe("https://api.example.com/v1");
      expect(response.headers.get("content-type")).toBe("application/json");
      expect(await response.json()).toEqual({ ok: true });
      const [call] = shell.callsOf("http_fetch");
      expect(call).toEqual({
        request: {
          method: "POST",
          url: "https://api.example.com/v1",
          headers: [["authorization", "Bearer k"]],
          body: "{}",
          followRedirects: true,
        },
        call: expect.any(Number),
      });
    });

    it("defaults to a GET without a body, and sends URL-encoded parameters as text", async () => {
      const shell = new FakeShell().answer("http_fetch", () => answer());
      const client = new ShellHttpClient(shell);

      await client.fetch("https://a.example/");
      await client.fetch("https://a.example/", {
        method: "POST",
        body: new URLSearchParams({ a: "1" }),
      });

      const [get, post] = shell.callsOf("http_fetch") as { request: Record<string, unknown> }[];
      expect(get?.request).toMatchObject({ method: "GET" });
      expect(get?.request).not.toHaveProperty("body");
      expect(post?.request["body"]).toBe("a=1");
    });

    it("refuses a body that isn't text before any call", async () => {
      const shell = new FakeShell().answer("http_fetch", () => answer());

      await expect(
        new ShellHttpClient(shell).fetch("https://a.example/", {
          method: "POST",
          body: new Uint8Array([1]),
        }),
      ).rejects.toThrow(TypeError);
      expect(shell.calls).toEqual([]);
    });

    it("resolves for an error status, as the port promises", async () => {
      const shell = new FakeShell().answer("http_fetch", () =>
        answer({ status: 429, body: "slow down" }),
      );

      const response = await new ShellHttpClient(shell).fetch("https://a.example/");

      expect(response.ok).toBe(false);
      expect(await response.text()).toBe("slow down");
    });

    it("makes a Response for a status that has no body", async () => {
      const shell = new FakeShell().answer("http_fetch", () => answer({ status: 204, body: "" }));

      const response = await new ShellHttpClient(shell).fetch("https://a.example/");

      expect(response.status).toBe(204);
      expect(response.body).toBeNull();
    });

    it("lets the shell follow redirects by default, and not with redirect error or manual", async () => {
      const shell = new FakeShell().answer("http_fetch", () => answer());
      const client = new ShellHttpClient(shell);

      await client.fetch("https://a.example/");
      await client.fetch("https://a.example/", { redirect: "error" });
      await client.fetch("https://a.example/", { redirect: "manual" });

      const follows = (
        shell.callsOf("http_fetch") as { request: { followRedirects: boolean } }[]
      ).map((call) => call.request.followRedirects);
      expect(follows).toEqual([true, false, false]);
    });

    it("throws on a redirect with redirect error, and returns it with manual", async () => {
      const redirect = answer({ status: 302, headers: [["location", "/next"]], body: "" });
      const shell = new FakeShell().answer("http_fetch", () => redirect);
      const client = new ShellHttpClient(shell);

      await expect(client.fetch("https://a.example/", { redirect: "error" })).rejects.toThrow(
        TypeError,
      );
      const manual = await client.fetch("https://a.example/", { redirect: "manual" });
      expect(manual.status).toBe(302);
    });

    it("doesn't take a 3xx without a Location for a redirect", async () => {
      const shell = new FakeShell().answer("http_fetch", () =>
        answer({ status: 304, headers: [], body: "" }),
      );

      const response = await new ShellHttpClient(shell).fetch("https://a.example/", {
        redirect: "error",
      });

      expect(response.status).toBe(304);
    });

    it("throws the shell's refusal with its kind, and keeps the refusal as the cause", async () => {
      const refusal = { kind: "address_refused", message: "that address is not one the app calls" };
      const shell = new FakeShell().answer("http_fetch", () => {
        throw refusal;
      });

      const error = await new ShellHttpClient(shell)
        .fetch("http://169.254.169.254/")
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(
        "address_refused: that address is not one the app calls",
      );
      expect((error as Error).cause).toBe(refusal);
    });

    it("passes on a failure that isn't a refusal as it is", async () => {
      const shell = new FakeShell().answer("http_fetch", () => {
        throw "command http_fetch not allowed";
      });

      await expect(new ShellHttpClient(shell).fetch("https://a.example/")).rejects.toBe(
        "command http_fetch not allowed",
      );
    });

    it("throws for a signal that is already aborted, and calls nothing", async () => {
      const shell = new FakeShell().answer("http_fetch", () => answer());

      await expect(
        new ShellHttpClient(shell).fetch("https://a.example/", { signal: AbortSignal.abort() }),
      ).rejects.toThrow();
      expect(shell.calls).toEqual([]);
    });

    it("rejects at once when the signal aborts, and tells the shell to stop that call", async () => {
      const shell = new FakeShell().answer("http_fetch", () => new Promise(() => undefined));
      shell.answer("http_fetch_abort", () => null);
      const controller = new AbortController();

      const pending = new ShellHttpClient(shell).fetch("https://a.example/", {
        signal: controller.signal,
      });
      controller.abort(new Error("too slow"));

      await expect(pending).rejects.toThrow("too slow");
      const [started] = shell.callsOf("http_fetch") as { call: number }[];
      expect(shell.callsOf("http_fetch_abort")).toEqual([{ call: started?.call }]);
    });

    it("ignores a shell that can't take the abort", async () => {
      const shell = new FakeShell().answer("http_fetch", () => new Promise(() => undefined));
      const controller = new AbortController();

      const pending = new ShellHttpClient(shell).fetch("https://a.example/", {
        signal: controller.signal,
      });
      controller.abort();

      await expect(pending).rejects.toThrow();
    });

    it("doesn't abort a call that has finished", async () => {
      const shell = new FakeShell().answer("http_fetch", () => answer());
      const controller = new AbortController();

      await new ShellHttpClient(shell).fetch("https://a.example/", { signal: controller.signal });
      controller.abort();

      expect(shell.callsOf("http_fetch_abort")).toEqual([]);
    });

    it("gives every call its own id", async () => {
      const shell = new FakeShell().answer("http_fetch", () => answer());
      const client = new ShellHttpClient(shell);

      await Promise.all([client.fetch("https://a.example/"), client.fetch("https://a.example/")]);

      const [first, second] = shell.callsOf("http_fetch") as { call: number }[];
      expect(first?.call).not.toBe(second?.call);
    });
  });

  describe("shellHttpClient", () => {
    it("makes a client for a page in the shell", () => {
      const page = { __TAURI_INTERNALS__: { invoke: async () => undefined } };

      expect(shellHttpClient(page)).toBeInstanceOf(ShellHttpClient);
    });

    it("makes none for a page outside the shell", () => {
      expect(shellHttpClient({})).toBeUndefined();
    });
  });
});
