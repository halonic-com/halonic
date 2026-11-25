import { verifies } from "@halonicjs/testing-spec";
import { expect, test, vi } from "vitest";
import { readStackRebaseSettings, stackRebaseOf } from "./stack-rebase-job.ts";

const ref = { type: "secret_ref", secretId: "secret-branch" } as const;

function job(config: Record<string, unknown>) {
  const resolve = vi.fn(async () => "ghs_branch_token_for_tests");
  const error = vi.fn();
  const get = vi.fn(async () => ({ records: [] }));
  return {
    resolve,
    error,
    get,
    job: {
      ctx: {
        secrets: { resolve },
        logger: { info: vi.fn(), error },
        state: { get, set: vi.fn(async () => undefined) },
      },
      companyId: "company-1",
      settings: readStackRebaseSettings(config),
      fetch: vi.fn(),
      get: vi.fn(),
      query: vi.fn(),
      repo: "halonic-com/halonic",
    },
  };
}

verifies("paperclip.pr-watcher-stack-rebase", () => {
  test("is off unless the board turns it on and sets the branch token, which it doesn't resolve up front", async () => {
    expect(readStackRebaseSettings({})).toEqual({ enabled: false, token: undefined });
    expect(readStackRebaseSettings({ stackRebase: "yes", branchUpdateToken: "plain" })).toEqual({
      enabled: false,
      token: undefined,
    });
    const off = job({ branchUpdateToken: ref });
    expect(await stackRebaseOf(off.job)).toBeUndefined();
    const noToken = job({ stackRebase: true });
    expect(await stackRebaseOf(noToken.job)).toBeUndefined();
    expect(noToken.error).toHaveBeenCalledTimes(1);
    const on = job({ stackRebase: true, branchUpdateToken: ref });
    expect(await stackRebaseOf(on.job)).toBeDefined();
    expect(on.resolve).not.toHaveBeenCalled();
    expect(off.get).not.toHaveBeenCalled();
  });
});
