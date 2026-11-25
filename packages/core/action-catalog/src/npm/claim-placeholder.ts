import { type StepperDefinition, strictParameters } from "@halonicjs/action-steppers";
import { npmPackage } from "../npm-parameters.ts";

/**
 * Claims a package name on npm by publishing a placeholder (inventory part 1, row 2).
 * Publishing happens in the user's terminal; the npm page shows whether the name is free.
 */
export const definition: StepperDefinition<Record<string, string | number>> = {
  id: "npm.claim-placeholder",
  version: 1,
  service: "npm",
  title: "Claim a package name with a placeholder",
  summary: "Publishes an empty first version so nobody else takes the name.",
  // A published version can't be replaced, and the name is public from then on.
  risk: "irreversible",
  parameters: strictParameters({ package: npmPackage }),
  steps: [
    {
      kind: "guided",
      address: "https://www.npmjs.com/package/{package}",
      instructions: [
        "If npm shows **404 Not Found**, the name is free; go on. If it shows a package page, someone owns the name: stop here and pick another name.",
        "Sign in to npm in a terminal with `npm login`, using the account that should own the package.",
        "In an empty folder, run `npm init -y`, then set `name` in `package.json` to {package} and `version` to `0.0.1`.",
        "Add a `README.md` that says the name is reserved, then run `npm publish --access public`.",
        "Reload the address above: the package page should now show version 0.0.1.",
        "Instructions follow npm's documentation: https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages",
      ],
      // From npm's public documentation; the live smoke test walks it.
      checkedOn: "2026-11-25",
    },
  ],
  targets: (parameters) => [{ service: "npm", kind: "package", name: `${parameters["package"]}` }],
  preview: (parameters) => [
    `Opens the npm page for ${parameters["package"]}, then you publish an empty first version from your terminal to claim the name. Halonic can't check it.`,
  ],
};
