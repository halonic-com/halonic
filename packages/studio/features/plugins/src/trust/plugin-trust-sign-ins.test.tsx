// @vitest-environment jsdom

import {
  pluginTrustChanges,
  pluginTrustContent,
  pluginTrustSectionHeadings,
  pluginTrustSections,
} from "@halonicjs/app";
import { type IntegrationSignIn, type Plugin, parseFile } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { changeSummary } from "./change-rows.ts";
import { PluginTrustDialog } from "./plugin-trust-dialog.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

const account: IntegrationSignIn = {
  purpose: "Your Acme projects",
  flow: "oauth-code",
  authorizeUrl: { fromSetting: "server", path: "/oauth/authorize" },
  tokenUrl: { fromSetting: "server", path: "/oauth/token" },
  clientId: "example-client",
  clientSecret: "acme-client",
  clientAuth: "post",
  scopes: [{ scope: "read_api", reason: "read your projects" }],
  access: { hosts: [{ fromSetting: "server" }], as: "bearer" },
};

/**
 * A plugin whose backend signs in to a self-hosted Acme server. The `plugin`
 * kind still refuses a backend with sign-ins until the agent host runs them
 * (HAL-8613), so they are added to the parsed manifest. Example data only.
 */
function acme(signIns: Readonly<Record<string, IntegrationSignIn>> = { account }): Plugin {
  const parsed = parseFile(
    "plugin",
    `id: acme
version: 1.0.0
sdk: 2
name: Acme
backend:
  hosts: [{ fromSetting: server, class: public }]
  tools:
    - { name: list-projects, description: Lists your projects., risk: read, untrusted: true }
ui:
  settings:
    server: { label: Server address, type: text, required: true }`,
  );
  if (!parsed.ok) throw new Error(parsed.error.map((problem) => problem.message).join("; "));
  const plugin = parsed.value.value;
  const backend = plugin.backend;
  if (backend === undefined) throw new Error("the fixture has a backend");
  return {
    ...plugin,
    backend: {
      ...backend,
      secrets: { "acme-client": { purpose: "The Acme app's client secret" } },
      signIns: { ...signIns },
    },
  };
}

function dialog(): HTMLDialogElement {
  const found = document.querySelector("dialog");
  if (found === null) throw new Error("No dialog");
  return found;
}

function open(manifest: Plugin) {
  render(
    <PluginTrustDialog
      manifest={manifest}
      origin={undefined}
      reason="add"
      onTrust={() => undefined}
      onNotNow={() => undefined}
    />,
  );
}

/** The Sign-ins section: the one whose row starts "Sign-ins". */
function signInsSection(): HTMLDetailsElement {
  const found = [...dialog().querySelectorAll("details")].find((details) =>
    details.querySelector("summary")?.textContent?.startsWith("Sign-ins"),
  );
  if (found === undefined) throw new Error("No Sign-ins section");
  return found;
}

const rows = () =>
  [...dialog().querySelectorAll("summary")].map((summary) => summary.textContent ?? "");

verifies("plugins.plugin-trust-sign-ins", () => {
  it("lists each sign-in after Secrets with its purpose and the approved trust line, naming a host a setting holds", () => {
    open(acme());
    const shown = rows();
    expect(shown.indexOf("Sign-ins (1)")).toBe(shown.indexOf("Secrets (1)") + 1);
    const text = signInsSection().textContent ?? "";
    expect(text).toContain("account");
    expect(text).toContain("Your Acme projects");
    expect(text).toContain(
      "Signs in to your Acme account at the address you enter under Server address. Halonic gets the tokens from the address you enter under Server address. It can: read your projects. The sign-in is used only with the address you enter under Server address.",
    );
    expect(text).not.toContain("different services");
    expect(signInsSection().querySelector("button")).toBeNull();
    expect(signInsSection().open).toBe(false);
  });

  it("shows the token host warning when the tokens come from another service", () => {
    open(acme({ account: { ...account, tokenUrl: "https://tokens.example.net/oauth/token" } }));
    expect(signInsSection().textContent).toContain(
      "The sign-in page and the token address are different services: the address you enter under Server address and tokens.example.net. Only continue if you expect that.",
    );
    // Open by itself, so the warning can't be missed before Trust (HAL-14004).
    expect(signInsSection().open).toBe(true);
  });

  it("shows no Sign-ins section for a plugin without sign-ins", () => {
    open(acme({}));
    expect(rows().some((row) => row.startsWith("Sign-ins"))).toBe(false);
  });

  it("marks a new, a changed and a removed sign-in in what changed, and lists an untouched one as unchanged", () => {
    const before = acme({ account, admin: { ...account, purpose: "Your Acme admin" } });
    const after = acme({
      account: { ...account, scopes: [{ scope: "api", reason: "change your projects" }] },
      reports: { ...account, purpose: "Your Acme reports" },
    });
    const content = (plugin: Plugin) => pluginTrustContent({ plugin, files: [] });
    const summary = changeSummary(after, pluginTrustChanges(content(before), content(after)));
    expect(summary.rows).toEqual(
      expect.arrayContaining([
        { tag: "New", what: "Sign-in reports", to: "Your Acme reports" },
        {
          tag: "Changed",
          what: "Sign-in account",
          to: "what it can do changed. It can: change your projects.",
        },
        { tag: "Removed", what: "Sign-in admin", from: "Your Acme admin" },
      ]),
    );
    expect(summary.rows.some((row) => row.what === "Manifest backend")).toBe(false);

    const moved = acme({ account: { ...account, clientId: "other-client" } });
    expect(changeSummary(moved, pluginTrustChanges(content(before), content(moved))).rows).toEqual(
      expect.arrayContaining([
        { tag: "Changed", what: "Sign-in account", to: "its client ID changed" },
      ]),
    );

    const same = changeSummary(before, pluginTrustChanges(content(before), content(before)));
    expect(same.unchanged).toEqual(expect.arrayContaining(["Sign-in account", "Sign-in admin"]));
  });
});

// The Studio half of the P8 parity check for Sign-ins; `halonic plugin add` shows it in
// apps/cli/src/output/plugin-trust-check-sign-ins.test.ts.
verifies("app.plugin-trust-sections", () => {
  it("shows Sign-ins under the shared model's heading, in its order", () => {
    const content = pluginTrustContent({ plugin: acme(), files: [] });
    open(acme());
    // A section's heading is its row without the count, or the caption above a row that is only a value.
    const headings = [...dialog().querySelectorAll("details")].map((details) => {
      const caption = details.previousElementSibling;
      if (caption?.tagName === "P") return caption.textContent ?? "";
      return (details.querySelector("summary")?.textContent ?? "").replace(/ \(\d+\)$/, "");
    });
    expect(headings).toEqual(
      pluginTrustSections(content).map((section) => pluginTrustSectionHeadings[section]),
    );
  });
});
