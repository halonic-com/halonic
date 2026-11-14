import type { CloudflareAccount, CloudflareApi, TokenStatus } from "./api.ts";

/** What a fake Cloudflare knows. */
export interface FakeCloudflareState {
  accounts: readonly CloudflareAccount[];
  /** Answers per endpoint; a missing entry means "active". */
  userToken?: TokenStatus | Error;
  accountToken?: TokenStatus | Error;
}

/** A {@link CloudflareApi} in memory that records each call, for tests of everything above the client. */
export function fakeCloudflareApi(state: FakeCloudflareState): CloudflareApi & { calls: string[] } {
  const calls: string[] = [];
  const answer = (value: TokenStatus | Error | undefined): TokenStatus => {
    if (value instanceof Error) throw value;
    return value ?? { active: true };
  };
  return {
    calls,
    async listAccounts() {
      calls.push("listAccounts");
      return state.accounts;
    },
    async verifyUserToken() {
      calls.push("verifyUserToken");
      return answer(state.userToken);
    },
    async verifyAccountToken(accountId) {
      calls.push(`verifyAccountToken ${accountId}`);
      return answer(state.accountToken);
    },
  };
}
