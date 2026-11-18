import { expect, test } from "@playwright/test";

/**
 * The plugin flow in a real browser (HAL-1740): add a plugin from a folder, trust it, run its
 * command, remove it. The page (e2e/pages/flow.tsx) draws the feature's real views over an
 * in-memory host, so this checks the dialogs, the focus and the toasts, not the computer's files.
 */
test("adds a plugin from a folder, trusts it, runs its command and removes it", async ({
  page,
}) => {
  await page.goto("/flow.html");
  await expect(page.getByText("No plugins yet")).toBeVisible();

  // Add plugin: a folder on this computer.
  await page.getByRole("button", { name: "Add plugin" }).click();
  const add = page.getByRole("dialog", { name: "Add a plugin" });
  await add.getByRole("textbox", { name: "Folder" }).fill("plugins/halonic-weather");
  await add.getByRole("button", { name: "Add", exact: true }).click();

  // The trust check opens at once; the plugin is listed but not on.
  const trust = page.getByRole("dialog", { name: "Trust Weather and turn it on?" });
  await expect(trust).toBeVisible();
  await trust.getByRole("button", { name: "Trust and turn on" }).click();
  await expect(trust).toBeHidden();
  await expect(page.getByRole("region", { name: "Commands" })).toBeVisible();
  await expect(page.getByText("Weather is on")).toBeVisible();

  // Its command: the dialog runs it and shows the Result.
  await page.getByRole("button", { name: "Show the forecast" }).click();
  const command = page.getByRole("dialog", { name: "Show the forecast" });
  await expect(command.getByRole("heading", { name: "Result" })).toBeVisible();
  await expect(command).toContainText("Sunny, 18 degrees in Ghent.");
  await command.getByRole("button", { name: "Close" }).click();
  await expect(command).toBeHidden();

  // Remove plugin, from the row's menu.
  await page.getByRole("button", { name: "More actions for Weather" }).click();
  await page.getByRole("menuitem", { name: "Remove plugin…" }).click();
  const remove = page.getByRole("dialog", { name: "Remove Weather?" });
  await remove.getByRole("button", { name: "Remove plugin" }).click();
  await expect(remove).toBeHidden();
  await expect(page.getByText("Weather removed")).toBeVisible();
  await expect(page.getByText("No plugins yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Show the forecast" })).toHaveCount(0);
});
