import { readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { type ProfileEnvironment, profileFolder } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { runCli } from "../../run-cli.ts";
import { acmeProposalsSetup, proposeIn, savedFile } from "../../test/acme-proposals.ts";
import { type AcmeRuns, makeAcmeRuns, removeAcmeRuns } from "../../test/acme-runs.ts";
import { captureIo } from "../../test/capture-io.ts";
import { proposalsCommandWith } from "./command.ts";

const runId = "run_mfx3k2a1_01jd8q";
let acmeRuns: AcmeRuns;

/** Acme as the home folder, so the default profile is inside the workspace. */
function homeIsAcme(runs: AcmeRuns): AcmeRuns {
  const profile: ProfileEnvironment = { ...runs.profile, homeFolder: runs.acme, variables: {} };
  return { ...runs, profile };
}

/** A path in the profile folder, as the workspace sees it. */
function profilePath(inside: string): string {
  const profile = profileFolder(acmeRuns.profile).root;
  return [...relative(acmeRuns.acme, profile).split(sep), inside].join("/");
}

beforeEach(async () => {
  acmeRuns = homeIsAcme(await makeAcmeRuns("proposals-accept-profile"));
});

afterEach(async () => {
  await removeAcmeRuns(acmeRuns);
});

verifies("cli.commands.proposals.accept-profile", () => {
  it("shows a file the run added in the profile as one it can't write (HAL-15764)", async () => {
    const inProfile = profilePath("unfenced-runs/x");
    await proposeIn(acmeRuns, runId, { [inProfile]: "yes\n", "notes/new.md": "New.\n" });

    const io = captureIo(acmeRuns.acme);
    const command = proposalsCommandWith(acmeProposalsSetup(acmeRuns));
    const code = await runCli(["proposals", "show", "01jd8q"], io, [command]);

    expect(code).toBe(0);
    expect(io.stdout).toContain(`added  ${inProfile}  (can't be written)`);
    expect(io.stdout).toContain("added  notes/new.md");
    expect(io.stdout).toContain("  +New.");
  });

  it("doesn't write a file the run added in the profile, and names it", async () => {
    const profile = profileFolder(acmeRuns.profile).root;
    const inProfile = profilePath("unfenced-runs/x");
    await proposeIn(acmeRuns, runId, { [inProfile]: "yes\n", "notes/new.md": "New.\n" });

    const io = captureIo(acmeRuns.acme);
    const command = proposalsCommandWith(acmeProposalsSetup(acmeRuns));
    await runCli(["proposals", "accept", "01jd8q"], io, [command]);

    expect(io.stdout[0]).toBe("Wrote 1 file: notes/new.md.");
    expect(io.stdout[1]).toContain(inProfile);
    expect(io.stdout[1]).toContain(
      "can't be written: Halonic never writes inside .git, .halonic or its own data folder.",
    );
    expect(await savedFile(acmeRuns, "notes/new.md")).toBe("New.\n");
    await expect(readFile(join(profile, "unfenced-runs", "x"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
