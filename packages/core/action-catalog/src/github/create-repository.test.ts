import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkStepGate,
  planResume,
  renderManualGuide,
  routesOf,
  type StepOutcome,
  stepperRequestFormat,
  validateStepperRequest,
} from "@halonicjs/action-steppers";
import { parse } from "@halonicjs/schema-kit";
import { FakeActionSender } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { shippedCatalog } from "../catalog.ts";
import {
  parseGithubRecording,
  recordedAnswers,
  recordedCalls,
} from "../github-replay.test-helper.ts";
import { definition } from "./create-repository.ts";

type Kept = Record<string, string | number | boolean | null>;

const parameters = {
  owner: "acme",
  name: "new-app",
  visibility: "public",
  environment: "production",
  reviewer: "acme-lead",
  wait_timer: 30,
  branches: "Protected branches only",
  secret: "NPM_TOKEN",
  installation_id: 5150,
};
const folder = join(import.meta.dirname, "..", "..", "fixtures", "github-create-repository");
const routes = routesOf(definition);

/** The steps' kinds, in order: the create, the label, the environment, the ruleset, the secret, the access, going public and the read-back. */
const kinds = [
  "call",
  "check",
  "call",
  "call",
  "guided",
  "check",
  "guided",
  "guided",
  "check",
  "guided",
  "guided",
  "check",
];

/** One step's request, its values sorted into the route's placeholders and body as the page does. */
function requestFor(step: number) {
  const route = routes.find((each) => each.step === step);
  if (route === undefined || route.kind !== "call") throw new Error(`step ${step} isn't a call`);
  const values: Record<string, string | number> = parameters;
  const placeholders = Object.fromEntries(
    Object.keys(route.placeholders).map((name) => [name, String(values[name])]),
  );
  const fromPage = route.body.filter((field) => field.kind === "string");
  const body = Object.fromEntries(fromPage.map((field) => [field.name, values[field.name] ?? ""]));
  const reference = { definition: definition.id, version: 1, step, placeholders };
  return fromPage.length === 0 ? reference : { ...reference, body };
}

/** A fake sender signed in to GitHub as `acme-dev` that replays one recorded scenario. */
async function replay(scenario: string, confirms = true) {
  const text = readFileSync(join(folder, `${scenario}.json`), "utf8");
  const recording = parseGithubRecording(text);
  const sender = new FakeActionSender({
    routes,
    signInAs: { github: "acme-dev" },
    answer: recordedAnswers(recording),
    user: { confirms, secret: () => undefined },
  });
  await sender.signIn("github");
  return { sender, recorded: recordedCalls(recording) };
}

/** The manual guide of a request that creates the repository and adds it to a Paperclip project. */
function manualGuide(): string {
  const request = JSON.stringify({
    format: stepperRequestFormat,
    title: "Create acme/new-app",
    reason: "The board said yes on the card.",
    blocks: [
      { kind: "use", ref: "github.create-repository@1", parameters },
      {
        kind: "use",
        ref: "paperclip.add-project-repository@1",
        parameters: {
          host: "paperclip.acme.example",
          company: "ACME",
          project: "new-app",
          owner: "acme",
          repo: "new-app",
        },
      },
    ],
  });
  const checked = validateStepperRequest(request, shippedCatalog);
  if (!checked.ok) throw new Error(checked.error.join("; "));
  return renderManualGuide(checked.value, shippedCatalog);
}

verifies("action-catalog.github-create-repository", () => {
  describe("github.create-repository@1", () => {
    it.each(["New-App", "-new-app", "new_app", "new.app", "", `a${"b".repeat(100)}`])(
      "refuses the repository name %j",
      (name) => {
        expect(parse(definition.parameters, parameters).ok).toBe(true);
        expect(parse(definition.parameters, { ...parameters, name }).ok).toBe(false);
      },
    );

    it.each([
      { visibility: "internal" },
      { installation_id: 0 },
      { secret: "npm-token" },
      { description: "acme" },
      { repo: "new-app" },
    ])("refuses %o", (change) => {
      expect(parse(definition.parameters, { ...parameters, ...change }).ok).toBe(false);
    });

    it("asks for acme/new-app, from the path and the body, before the create call, and sends nothing if the user doesn't confirm", async () => {
      expect(definition.risk).toBe("irreversible");
      expect(routes[0]).toMatchObject({
        step: 1,
        method: "POST",
        risk: "irreversible",
        path: "/orgs/{owner}/repos",
        target: "{owner}/{name}",
      });
      const { sender } = await replay("create-and-check", false);
      expect(await sender.send(requestFor(1))).toEqual({ outcome: "cancelled" });
      expect(sender.sent).toEqual([]);
    });

    it("creates the repository with our defaults, adds the label and environment, and reads the settings back", async () => {
      const { sender, recorded } = await replay("create-and-check");
      const kept = new Map<number, Kept>();
      for (const step of [1, 2, 3, 4, 12]) {
        const gate = checkStepGate(definition, step, {}, kept, parameters);
        expect(gate, `step ${step}`).toEqual({ ok: true });
        const result = await sender.send(requestFor(step));
        if (result.outcome !== "answered") throw new Error(`step ${step}: ${result.outcome}`);
        expect(result.error, `step ${step}`).toBeUndefined();
        kept.set(step, result.kept);
      }
      expect(sender.sent).toEqual(recorded);
      expect(kept.get(1)).toEqual({
        id: 901234,
        full_name: "acme/new-app",
        default_branch: "main",
      });
      const preview = definition.preview(parameters, kept.get(12));
      expect(preview).toHaveLength(definition.steps.length);
      expect(preview[11]).toBe(
        "acme/new-app: public (as asked), default branch `main`, squash merging on (as our default), merge commits off (as our default), rebase merging off (as our default), auto-merge on (as our default), deleting the branch after a merge on (as our default).",
      );
    });

    it("stops before the label when the new repository's default branch isn't main", async () => {
      const { sender } = await replay("default-branch-master");
      const read = await sender.send(requestFor(2));
      const kept = read.outcome === "answered" ? read.kept : {};
      expect(checkStepGate(definition, 3, {}, new Map([[2, kept]]), parameters)).toEqual({
        ok: false,
        check: 2,
        cause: "requires",
        changes: [],
        message:
          "The new repository's default branch isn't `main`. Rename it on GitHub's Branches page, then resume.",
      });
    });

    it("previews a private repository, the read-back before it runs, and a setting that isn't our default", () => {
      const privately = { ...parameters, visibility: "private" };
      const before = definition.preview(privately);
      expect(before[0]).toBe(
        "Creates the private repository acme/new-app with a README, squash merging only, auto-merge on and branches deleted after a merge.",
      );
      expect(before[10]).toBe(
        "Opens acme/new-app's settings; it stays private, so there is nothing to change.",
      );
      expect(before[11]).toBe(
        "Reads acme/new-app's settings back and shows them next to our defaults.",
      );
      expect(definition.preview(parameters)[10]).toBe(
        "Opens acme/new-app's settings, where you make it public. Everyone can then see it, and that can't be undone.",
      );
      const changed = {
        visibility: "private",
        default_branch: "main",
        allow_squash_merge: true,
        allow_merge_commit: true,
        allow_rebase_merge: false,
        allow_auto_merge: false,
        delete_branch_on_merge: true,
      };
      expect(definition.preview(parameters, changed)[11]).toBe(
        "acme/new-app: private (the request asked for public), default branch `main`, squash merging on (as our default), merge commits on (our default is off), rebase merging off (as our default), auto-merge off (our default is on), deleting the branch after a merge on (as our default).",
      );
      expect(definition.targets(parameters)).toEqual([
        { service: "github", kind: "repository", name: "acme/new-app" },
      ]);
    });

    it("reuses the environment and secret steps, with the repository as {name} and the secret as {secret}", () => {
      expect(definition.steps.map((step) => step.kind)).toEqual(kinds);
      expect(routes.find((route) => route.step === 6)).toMatchObject({
        path: "/repos/{owner}/{name}/environments/{environment}",
      });
      expect(routes.find((route) => route.step === 9)).toMatchObject({
        path: "/repos/{owner}/{name}/actions/secrets/{secret}",
      });
      const calls = routes.filter((route) => route.kind === "call" && route.method !== "GET");
      expect(calls.map((route) => route.kind === "call" && route.target)).toEqual([
        "{owner}/{name}",
        "{owner}/{name}",
        "{owner}/{name}",
      ]);
    });

    it("after a failed access step, Resume runs only that step, going public and the read-back", () => {
      const outcomes = new Map<number, StepOutcome>();
      for (let step = 1; step <= 9; step++) outcomes.set(step, "succeeded");
      outcomes.set(10, "failed");
      expect(planResume(definition.steps, outcomes)).toEqual({ kind: "run", steps: [10, 11, 12] });
    });

    it("gives a numbered manual guide that starts on GitHub's new repository page and ends on the Paperclip project", () => {
      expect(manualGuide()).toBe(
        [
          "`Create acme/new-app`",
          "",
          "Do these steps in order, signed in with your own account:",
          "1. Open https://github.com/organizations/acme/repositories/new",
          "2. Set **Repository name** to `new-app`.",
          "3. Choose **Private**, and tick **Add a README file**.",
          "4. Click **Create repository**.",
          "5. On the new repository's **Settings** page, under **Pull Requests**, allow squash merging only, and tick **Allow auto-merge** and **Automatically delete head branches**.",
          "6. Open https://github.com/acme/new-app",
          "7. Check that the repository shows **Private** next to its name, and that its branch is `main`.",
          "8. Open https://github.com/acme/new-app/labels",
          "9. Click **New label**, set **Label name** to `built-on:paperclip` and click **Create label**.",
          "10. Open https://github.com/acme/new-app/settings/environments/new",
          "11. Set **Name** to `production` and click **Configure environment**.",
          "12. Open https://github.com/acme/new-app/settings/environments",
          "13. Click `production`.",
          "14. Under **Deployment protection rules**, tick **Required reviewers** and add `acme-lead`.",
          "15. Tick **Wait timer** and set it to `30` minutes, or untick it for 0.",
          "16. Click **Save protection rules**.",
          "17. Under **Deployment branches and tags**, choose `Protected branches only`.",
          "18. Open https://github.com/acme/new-app/settings/environments",
          "19. Click `production` and check the rules you just set are shown.",
          "20. Open https://github.com/acme/new-app/settings/rules/new",
          "21. Set **Ruleset Name** to `main` and **Enforcement status** to **Active**.",
          "22. Under **Target branches**, click **Add target** and choose **Include default branch**.",
          "23. Under **Rules**, tick **Require a pull request before merging**, **Require status checks to pass** with the check `ci-ok`, **Require merge queue** and **Block force pushes**.",
          "24. Click **Create**.",
          "25. Open https://github.com/acme/new-app/settings/secrets/actions",
          "26. On the **Secrets** tab, under **Repository secrets**, find `NPM_TOKEN` and click its pencil icon. If it isn't listed, click **New repository secret** and set **Name** to `NPM_TOKEN`.",
          "27. Paste or type the value into **Secret** (or **Value**). Type it only there, never in a chat or a request.",
          "28. Click **Update secret** (or **Add secret**).",
          "29. Open https://github.com/acme/new-app/settings/secrets/actions",
          "30. Check that `NPM_TOKEN` is listed under **Repository secrets** and was updated just now.",
          "31. Open https://github.com/organizations/acme/settings/installations/5150",
          "32. Under **Repository access**, if **All repositories** is chosen, the agents already have `new-app`: go on.",
          "33. Otherwise, with **Only select repositories** chosen, click **Select repositories**, choose `new-app`, and click **Save**.",
          "34. Open https://github.com/acme/new-app/settings",
          "35. The request asks for a `public` repository. If that's `private`, there's nothing to do here: it is private already.",
          "36. If it's `public`: under **Danger Zone**, click **Change visibility**, then **Change to public**.",
          "37. Read what GitHub says changes, type the repository's name to confirm, and click the button below it.",
          "38. Open https://github.com/acme/new-app/settings",
          "39. Check that the default branch is `main`, and that under **Pull Requests** only squash merging is allowed, with auto-merge and deleting head branches ticked.",
          "40. Open https://paperclip.acme.example/ACME/projects/new-app",
          "41. Sign in to this Paperclip as a board member if the page asks.",
          "42. Open the project's **Workspaces** and click **Add workspace**.",
          "43. Choose GitHub, add the repository `acme`/`new-app`, and save.",
          "",
        ].join("\n"),
      );
    });
  });
});
