import { defineMessages } from "./define.ts";
import { markPart, phrase } from "./phrase.ts";

/**
 * The sentences of `halonic deploy` while it deploys and when it's live
 * (deploy flow, revision 5, sections 2.8 to 2.10). Names the user meets on
 * Cloudflare's dashboard and bill (Worker, D1 database, R2 bucket, version),
 * never "provision", "migrate" or "smoke test".
 */
export const deployMessages = defineMessages("deploy", {
  /** One thing a deploy creates, for "Creating …" and "Created …". */
  address: (name: string) => phrase`the workers.dev address ${name}`,
  service: (name: string) => phrase`the Worker ${name}`,
  database: (name: string) => phrase`the D1 database ${name}`,
  bucket: (name: string) => phrase`the R2 bucket ${name}`,

  creating: (what: string) => phrase`Creating ${what}`,
  updatingDatabase: () => phrase`Updating the database`,
  uploading: (version: number, files: number) =>
    phrase`Uploading version ${version} ${markPart("separator")} ${files} files`,
  selfTesting: (version: number) => phrase`Self-test of version ${version}`,
  switching: (version: number) => phrase`Making version ${version} live`,

  /** Every thing created, in one line: "the Worker acme, the D1 database acme-data and …". */
  created: (what: string) => phrase`${markPart("done")} Created ${what}.`,
  databaseSetUp: () => phrase`${markPart("done")} Set up the database.`,
  databaseUpdated: (changes: number) =>
    phrase`${markPart("done")} Updated the database: ${changes === 1 ? "1 change" : `${changes} changes`}.`,
  uploaded: (version: number, secrets: number) =>
    secrets === 0
      ? phrase`${markPart("done")} Uploaded version ${version}.`
      : phrase`${markPart("done")} Uploaded version ${version} with ${secrets === 1 ? "1 secret" : `${secrets} secrets`}.`,
  selfTestPassed: (version: number) =>
    phrase`${markPart("done")} Self-test of version ${version} passed.`,

  live: (workspace: string, deployment: string, url: string) =>
    phrase`${markPart("done")} ${workspace} is live on ${deployment}: ${url}`,
  deployedAs: (commit: string, version: number, took: string) =>
    phrase`  Deployed commit ${commit} as version ${version} in ${took}.`,
  /** When the Halonic that deployed is another than the one the version before ran. */
  deployedWithHalonicAs: (
    commit: string,
    halonic: string,
    was: string,
    version: number,
    took: string,
  ) =>
    phrase`  Deployed commit ${commit} with Halonic ${halonic} (was ${was}) as version ${version} in ${took}.`,
  /** Follows "Deployed …" on the same line when there's a version to go back to. */
  kept: (version: number, deployment: string) =>
    phrase` Version ${version} is kept: halonic deploy rollback ${deployment}`,
  /** Same commit and Halonic as what's live: no new version was made. */
  unchanged: (deployment: string, commit: string, halonic: string) =>
    phrase`${markPart("done")} ${deployment} already runs commit ${commit} with Halonic ${halonic}. Nothing changed on Cloudflare.`,
  /** A line from the target the user must see, such as the lock lost after the switch. The deploy is live. */
  warning: (message: string) => phrase`${markPart("needsYou")} ${message}`,
});
