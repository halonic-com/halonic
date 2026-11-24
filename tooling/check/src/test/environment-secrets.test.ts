import { describe, expect, it } from "vitest";
import { runChecks } from "./fixture-repo.ts";

/** The `file:line` of each environment-secrets finding for these files. */
function findings(files: Readonly<Record<string, string>>): string[] {
  return runChecks([], { extraFiles: files })
    .filter((problem) => problem.rule === "environment-secrets")
    .map(({ file, line }) => `${file}:${line}`)
    .sort();
}

const header = "name: acme\non: push\npermissions: {}\n";

describe("tooling/check: secrets only in environment jobs", () => {
  it("fails on a job that reads a secret without an environment", () => {
    const workflow = `${header}jobs:
  submit:
    runs-on: ubuntu-24.04
    steps:
      - name: Submit
        env:
          TOKEN: \${{ secrets.ACME_TOKEN }}
        run: ./submit
      - run: echo "\${{ secrets['ACME_OTHER'] }}"
`;
    expect(findings({ ".github/workflows/acme.yml": workflow })).toEqual([
      ".github/workflows/acme.yml:10",
      ".github/workflows/acme.yml:12",
    ]);
  });

  it("passes the same job inside an environment, and GITHUB_TOKEN anywhere", () => {
    const workflow = `${header}jobs:
  build:
    runs-on: ubuntu-24.04
    steps:
      # A comment may name secrets.ACME_TOKEN.
      - run: gh release view
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
  submit:
    needs: build
    runs-on: ubuntu-24.04
    environment: acme-release
    steps:
      - env:
          TOKEN: \${{ secrets.ACME_TOKEN }}
        run: ./submit
`;
    expect(findings({ ".github/workflows/acme.yaml": workflow })).toEqual([]);
  });

  it("fails on secrets passed to a reusable workflow outside an environment", () => {
    const workflow = `${header}jobs:
  call:
    uses: ./.github/workflows/acme-called.yml
    secrets: inherit
  pass:
    uses: ./.github/workflows/acme-called.yml
    secrets:
      token: \${{ secrets.ACME_TOKEN }}
`;
    expect(findings({ ".github/workflows/acme.yml": workflow })).toEqual([
      ".github/workflows/acme.yml:11",
      ".github/workflows/acme.yml:7",
    ]);
  });

  it("counts only the job's own environment key, not a step's", () => {
    const workflow = `${header}jobs:
  submit:
    runs-on: ubuntu-24.04
    steps:
      - uses: acme/deploy@0000000000000000000000000000000000000000
        with:
          environment: production
          token: \${{ secrets.ACME_TOKEN }}
`;
    expect(findings({ ".github/workflows/acme.yml": workflow })).toEqual([
      ".github/workflows/acme.yml:11",
    ]);
  });

  it("reads only workflow files", () => {
    expect(
      findings({
        "docs/acme.yml": `${header}jobs:\n  submit:\n    run: \${{ secrets.ACME_TOKEN }}\n`,
      }),
    ).toEqual([]);
  });
});
