import { trustBadgePriority } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { account, record } from "./accounts.test-helper.ts";
import { connectorBadge } from "./connector-badges.ts";

const signedIn = "2026-11-12T02:10:00.000Z";

verifies("google-setup.connector-badges", () => {
  it("has no badge for a connected account or one never set up", () => {
    expect(
      connectorBadge(account(record([], { lastSignInAt: signedIn })), vi.fn()),
    ).toBeUndefined();
    expect(connectorBadge(account(record([])), vi.fn())).toBeUndefined();
  });

  it("says Needs sign-in for a refused sign-in, with the library's words and tone", () => {
    const refused = record([], {
      lastSignInAt: signedIn,
      refreshRefused: { reason: "sign-in", at: signedIn },
    });
    const badge = connectorBadge(account(refused), vi.fn());
    expect(badge).toMatchObject({ label: "Needs sign-in", tone: "attention", action: "Fix" });
    expect(badge?.priority).toBeLessThan(trustBadgePriority);
  });

  it("puts Needs new secret before Needs sign-in, and both below the trust badge", () => {
    const secret = connectorBadge(
      account(
        record([], { lastSignInAt: signedIn, refreshRefused: { reason: "client", at: signedIn } }),
      ),
      vi.fn(),
    );
    const signIn = connectorBadge(
      account(
        record([], { lastSignInAt: signedIn, refreshRefused: { reason: "sign-in", at: signedIn } }),
      ),
      vi.fn(),
    );
    expect(secret?.label).toBe("Needs new secret");
    expect(secret?.priority).toBeGreaterThan(signIn?.priority ?? Number.POSITIVE_INFINITY);
    expect(secret?.priority).toBeLessThan(trustBadgePriority);
  });

  it("keeps the address to the tooltip and opens the account's setup on Fix", () => {
    const open = vi.fn();
    const refused = record([], {
      lastSignInAt: signedIn,
      refreshRefused: { reason: "sign-in", at: signedIn },
    });
    const badge = connectorBadge(account(refused), open);
    expect(badge?.id).not.toContain("example.com");
    expect(badge?.tooltip).toContain("x@example.com");
    badge?.onSelect?.(null);
    expect(open).toHaveBeenCalledWith(refused.accountRef, null);
  });
});
