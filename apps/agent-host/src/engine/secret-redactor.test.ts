import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { BrokerSecrets } from "./broker-secrets.ts";
import type { BrokerAnswer } from "./control-messages.ts";
import type { BrokerRequestKind } from "./control-pipe.ts";
import { redactStandardError, SecretRedactor } from "./secret-redactor.ts";

/** An invented value with no known key shape. */
const refreshToken = "acme-refresh-Q7xQ7xQ7xQ7x";

/** A broker that holds `acme_refresh_token`. */
async function askAcme(_kind: BrokerRequestKind, name: string): Promise<BrokerAnswer> {
  return { result: "value", value: name === "acme_refresh_token" ? refreshToken : null };
}

/**
 * A stand-in for standard error that keeps what reaches it, and the
 * uncaught-error hook it was given. Like a pipe on macOS, it holds each
 * write's callback until `flush` is called, and counts the process exits.
 */
function fakeStandardError() {
  const written: string[] = [];
  const pending: (() => void)[] = [];
  const stream = {
    write: ((chunk: string | Uint8Array, callback?: unknown) => {
      written.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
      if (typeof callback === "function") pending.push(() => callback());
      return true;
    }) as NodeJS.WriteStream["write"],
  };
  const exits = { count: 0 };
  let uncaught: ((error: unknown, exit: () => void) => void) | undefined;
  const catchUncaught = (handle: (error: unknown, exit: () => void) => void) => {
    uncaught = handle;
  };
  const throwUncaught = (error: unknown) =>
    uncaught?.(error, () => {
      exits.count += 1;
    });
  const flush = () => {
    for (const callback of pending.splice(0)) callback();
  };
  return { written, stream, catchUncaught, throwUncaught, flush, exits };
}

verifies("agent-host.engine-stderr-redaction", () => {
  describe("SecretRedactor", () => {
    it("redacts a broker secret from standard error after its step ended", async () => {
      const redactor = new SecretRedactor();
      const stderr = fakeStandardError();
      redactStandardError(redactor, stderr.stream, stderr.catchUncaught);
      // BrokerSecrets ends the read's step before it returns the value.
      expect(await new BrokerSecrets(askAcme, redactor).get("acme_refresh_token")).toBe(
        refreshToken,
      );
      stderr.stream.write(`bad token ${refreshToken}\n`);
      stderr.stream.write(Buffer.from(`again ${refreshToken}\n`));
      expect(stderr.written).toEqual(["bad token [redacted]\n", "again [redacted]\n"]);
    });

    it("redacts the value as it appears inside a JSON string, escaped once or twice", () => {
      const redactor = new SecretRedactor();
      const quoted = 'acme"pass\nword';
      redactor.remember(quoted);
      const json = JSON.stringify({ password: quoted });
      expect(redactor.redact(json)).toBe('{"password":"[redacted]"}');
      expect(redactor.redact(JSON.stringify(json))).toBe(
        JSON.stringify('{"password":"[redacted]"}'),
      );
    });

    it("redacts the longer of two values that overlap first", () => {
      const redactor = new SecretRedactor();
      redactor.remember("acme");
      redactor.remember("acme-long-secret");
      expect(redactor.redact("key acme-long-secret")).toBe("key [redacted]");
    });

    it("prints an uncaught error's stack redacted", () => {
      const redactor = new SecretRedactor();
      const stderr = fakeStandardError();
      redactStandardError(redactor, stderr.stream, stderr.catchUncaught);
      redactor.remember(refreshToken);
      stderr.throwUncaught(new Error(`refused ${refreshToken}`));
      expect(stderr.written.join("")).toContain("Error: refused [redacted]");
      expect(stderr.written.join("")).not.toContain(refreshToken);
    });

    it("ends the process only once the uncaught error's stack is written", () => {
      const stderr = fakeStandardError();
      redactStandardError(new SecretRedactor(), stderr.stream, stderr.catchUncaught);
      stderr.throwUncaught(new Error("acme failure"));
      expect(stderr.written.join("")).toContain("Error: acme failure");
      expect(stderr.exits.count).toBe(0);
      stderr.flush();
      expect(stderr.exits.count).toBe(1);
    });

    it("leaves a text unchanged when no secret was handed out", async () => {
      const redactor = new SecretRedactor();
      redactor.remember(null);
      redactor.remember("");
      expect(await new BrokerSecrets(askAcme, redactor).get("acme_other")).toBeNull();
      expect(redactor.redact("nothing secret here")).toBe("nothing secret here");
    });
  });
});
