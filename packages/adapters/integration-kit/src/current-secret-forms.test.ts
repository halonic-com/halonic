import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { currentSecretForms, removeCurrentSecretsStream } from "./current-secret-forms.ts";
import { removeSecrets, secretRemoved } from "./secret-filter.ts";

const token = "fake-access-token-0000000001";

verifies("integration-kit.current-secret-forms", () => {
  it("matches a sign-in token once it is listed, in the forms a secret is matched in", () => {
    const listed: string[] = [];
    const current = currentSecretForms([{ value: "fake-picked-secret-1" }], {
      filterValues: () => listed,
    });
    const before = current();

    listed.push(token);
    const after = current();

    expect(removeSecrets(`Bearer ${token}`, before)).toBe(`Bearer ${token}`);
    expect(removeSecrets(`Bearer ${token}`, after)).toBe(`Bearer ${secretRemoved}`);
    expect(removeSecrets(`a=${encodeURIComponent("x y")}&t=${token}`, after)).toBe(
      `a=x%20y&t=${secretRemoved}`,
    );
    expect(removeSecrets("fake-picked-secret-1", after)).toBe(secretRemoved);
  });

  it("gives the same forms until a listed value changes", () => {
    const listed = [token];
    const current = currentSecretForms([], { filterValues: () => listed });

    const first = current();
    expect(current()).toBe(first);

    listed.push("fake-access-token-0000000002");

    expect(current()).not.toBe(first);
  });

  it("gives fixed forms when there are no sign-in tokens", () => {
    const current = currentSecretForms([{ value: "fake-picked-secret-1" }]);

    expect(current()).toBe(current());
  });

  it("removes a token split across the piece before the forms change and the piece after", async () => {
    const listed: string[] = [];
    const current = currentSecretForms([{ value: "fake-picked-secret-1" }], {
      filterValues: () => listed,
    });
    const stream = removeCurrentSecretsStream(current);
    const encoder = new TextEncoder();
    const writer = stream.writable.getWriter();
    const read = new Response(stream.readable).text();

    await writer.write(encoder.encode(`x ${token.slice(0, 10)}`));
    listed.push(token);
    await writer.write(encoder.encode(`${token.slice(10)} y`));
    await writer.close();

    expect(await read).toBe(`x ${secretRemoved} y`);
  });
});
