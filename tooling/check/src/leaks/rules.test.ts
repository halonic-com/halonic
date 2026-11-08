import { describe, expect, it } from "vitest";
import { fileNameOf, fileRules } from "./files.ts";
import { findAbsolutePaths } from "./paths.ts";
import { findRuleMatches, fingerprint, isPlaceholder, maskSecret, secretRules } from "./secrets.ts";
import { absolute, fakeSecrets, filler } from "./test-values.ts";

function secretRulesHit(line: string): string[] {
  return secretRules
    .filter((rule) => findRuleMatches(rule, line).some((value) => !isPlaceholder(value)))
    .map((rule) => rule.name);
}

describe("secret rules", () => {
  for (const rule of secretRules) {
    it(`finds ${rule.name}`, () => {
      const value = fakeSecrets[rule.name] ?? "";
      expect(secretRulesHit(`const key = "${value}";`)).toEqual([rule.name]);
    });
  }

  it("lets the documented AWS examples and filler through", () => {
    expect(secretRulesHit(`AKIAIOSFODNN7${"EXAMPLE"}`)).toEqual([]);
    expect(secretRulesHit(`ghp_${"X".repeat(36)}`)).toEqual([]);
  });

  it("ignores text that only resembles a key", () => {
    expect(secretRulesHit("The AKIA prefix marks an AWS key; ghp_ marks a GitHub token.")).toEqual(
      [],
    );
    expect(secretRulesHit(`hash = "${filler(40)}"`)).toEqual([]);
  });

  it.each(["client_secret", "refresh_token", "access_token", "id_token", "code_verifier"])(
    "finds a literal value in %s, quoted or in a form body",
    (name) => {
      expect(secretRulesHit(`{ "${name}": "${filler(40)}" }`)).toEqual(["oauth-field"]);
      expect(secretRulesHit(`${name} = '${filler(40)}'`)).toEqual(["oauth-field"]);
      expect(secretRulesHit(`grant_type=refresh_token&${name}=${filler(40)}`)).toEqual([
        "oauth-field",
      ]);
    },
  );

  it("lets an OAuth field that holds a variable or a template through", () => {
    expect(secretRulesHit("access_token: tokens.accessTokenFromGoogle,")).toEqual([]);
    expect(secretRulesHit("refresh_token = current.refreshTokenValue")).toEqual([]);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a template, written literally
    expect(secretRulesHit("body: `client_secret=${clientSecretFromStore}`")).toEqual([]);
  });

  it("finds an authorization code in a token request, before or after the grant type", () => {
    const code = filler(40);
    expect(secretRulesHit(`grant_type=authorization_code&code=${code}`)).toEqual(["oauth-code"]);
    expect(secretRulesHit(`code=${code}&grant_type=authorization_code`)).toEqual(["oauth-code"]);
    expect(secretRulesHit(`{"grant_type": "authorization_code", "code": "${code}"}`)).toEqual([
      "oauth-code",
    ]);
    expect(secretRulesHit(`{"code": "${code}", "grant_type": "authorization_code"}`)).toEqual([
      "oauth-code",
    ]);
  });

  it("lets code through outside a query string and a token request", () => {
    const code = filler(40);
    expect(secretRulesHit(`{ "code": "${code}" }`)).toEqual([]);
    expect(secretRulesHit(`error_code=${code}`)).toEqual([]);
    expect(secretRulesHit("{ grant_type: GRANT, code: authorizationCodeFromCallback }")).toEqual(
      [],
    );
  });

  it("checks a long line after code quickly", () => {
    // Without a token request on the line, the rule must give up on the value
    // once, not once per character: that would take seconds on a minified file.
    const line = `code="${filler(50_000)}`;
    const start = performance.now();
    expect(secretRulesHit(line)).toEqual([]);
    expect(performance.now() - start).toBeLessThan(500);
  });

  it("checks a long line with many code matches and no grant type quickly", () => {
    // Minified code such as `x.code===someLongPropertyChain`, 5,000 times on one
    // line. Looking for `grant_type` after each of them would take seconds.
    const line = Array.from({ length: 5_000 }, () => `x.code===${filler(30)}`).join(";");
    const start = performance.now();
    expect(secretRulesHit(line)).toEqual([]);
    expect(performance.now() - start).toBeLessThan(500);
  });

  it("finds a code that is both in a query string and in a token request once", () => {
    const code = filler(40);
    const rule = secretRules.find(({ name }) => name === "oauth-code");
    const line = `grant_type=authorization_code&code=${code}`;
    expect(rule && findRuleMatches(rule, line)).toEqual([code]);
  });

  it("masks a secret down to its prefix and length", () => {
    const value = fakeSecrets["github-token"] ?? "";
    const masked = maskSecret("github-token", value);
    expect(masked).toBe("ghp_******** (40 characters)");
    expect(masked).not.toContain(value.slice(4, 12));
  });

  it("shows no characters at all of a secret without a public prefix", () => {
    expect(maskSecret("aws-secret-key", filler(40))).toBe("******** (40 characters)");
    expect(maskSecret("url-password", filler(20))).toBe("******** (20 characters)");
  });

  it("lets a URL without a password and an npmrc variable through", () => {
    expect(secretRulesHit("https://user@example.com and https://example.com:8080/x")).toEqual([]);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: an npmrc variable, written literally
    expect(secretRulesHit("//registry.npmjs.org/:_authToken=${NPM_TOKEN}")).toEqual([]);
  });

  it("fingerprints a value the same way every time, without showing it", () => {
    const value = fakeSecrets["npm-token"] ?? "";
    expect(fingerprint(value)).toMatch(/^fp:[0-9a-f]{16}$/);
    expect(fingerprint(value)).toBe(fingerprint(value));
    expect(fingerprint(value)).not.toBe(fingerprint(`${value}x`));
  });
});

describe("absolute-path rule", () => {
  it("finds home, temp and agent folders, and shows only the root", () => {
    expect(findAbsolutePaths(`see ${absolute("home", "someone", "notes.md")}`)).toEqual(["/home/"]);
    expect(findAbsolutePaths(absolute("Users", "someone", "x"))).toEqual(["/Users/"]);
    expect(findAbsolutePaths(absolute("paperclip", "instances", "x"))).toEqual(["/paperclip/"]);
    expect(findAbsolutePaths(`"${absolute("tmp", "build-1")}"`)).toEqual(["/tmp/"]);
    expect(findAbsolutePaths(absolute("var", "folders", "x7", "T"))).toEqual(["/var/folders/"]);
    expect(findAbsolutePaths(`file://${absolute("home", "someone")}`)).toEqual(["/home/"]);
  });

  it("finds Windows drive paths, also with JSON's doubled backslashes", () => {
    expect(findAbsolutePaths(["C:", "Users", "someone"].join("\\"))).toEqual(["C:\\"]);
    expect(findAbsolutePaths(`"${["D:", "", "work", "", "x"].join("\\")}"`)).toEqual(["D:\\\\"]);
    expect(findAbsolutePaths(["C:", "Users", "someone"].join("/"))).toEqual(["/Users/"]);
  });

  it("lets prose, URLs, relative paths and placeholders through", () => {
    const fine = [
      "Temporary files go to /tmp by default.",
      "Clean /tmp/ when the disk is full.",
      "https://example.com/home/page and https://home/x",
      "./tmp/cache, ~/.config/halonic/deny-terms, $HOME/.cache",
      `\`\${root}/tmp/cache\`, <workspace>/tmp/x, **/tmp/** and /home/… in docs`,
      String.raw`a regex like /[a-z]:\d/ or /\w:\\/`,
    ];
    for (const line of fine) {
      expect(findAbsolutePaths(line), line).toEqual([]);
    }
  });
});

describe("file rules", () => {
  function fileRulesHit(path: string): string[] {
    return fileRules.filter((rule) => rule.matches(fileNameOf(path))).map((rule) => rule.name);
  }

  it("finds .env files and private key or keystore files", () => {
    expect(fileRulesHit(".env")).toEqual(["env-file"]);
    expect(fileRulesHit("apps/studio/.env.local")).toEqual(["env-file"]);
    expect(fileRulesHit(".envrc")).toEqual(["env-file"]);
    expect(fileRulesHit("deploy/id_ed25519")).toEqual(["key-file"]);
    expect(fileRulesHit("android/release.keystore")).toEqual(["key-file"]);
    expect(fileRulesHit("certs/server.PEM")).toEqual(["key-file"]);
    expect(fileRulesHit("deploy/id_rsa_work")).toEqual(["key-file"]);
    expect(fileRulesHit("infra/prod.tfvars")).toEqual(["env-file"]);
    expect(fileRulesHit("worker/.dev.vars")).toEqual(["env-file"]);
    expect(fileRulesHit("apps/local.env")).toEqual(["env-file"]);
  });

  it("finds credentials files", () => {
    for (const path of [".npmrc", "home/.netrc", ".pgpass", "aws/credentials"]) {
      expect(fileRulesHit(path), path).toEqual(["credential-file"]);
    }
  });

  it("lets templates and look-alike names through", () => {
    for (const path of [
      ".env.example",
      ".env.sample",
      "docs/env.md",
      "src/environment.ts",
      "keys.ts",
      "deploy/id_ed25519.pub",
      "src/credentials.ts",
      "src/environment.d.ts",
    ]) {
      expect(fileRulesHit(path), path).toEqual([]);
    }
  });
});
