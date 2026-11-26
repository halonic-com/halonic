import { RunsListService } from "@halonicjs/studio-feature-runs/api";
import { defineFeature, type WorkspaceContext } from "@halonicjs/studio-shell";
import { ALIAS_KIND, ALIAS_KIND_LABEL, aliasTitle, MODELS_HEADING } from "./aliases/alias-text.ts";
import { readModels, subscribeProviderNames } from "./aliases/read-models.ts";
import {
  KeyAddressQuestionsService,
  ModelKeysService,
  ModelsFilesService,
  ModelsService,
  NoLimitMemoryService,
  ProviderCheckService,
} from "./api.ts";
import { KeyAddressQueue } from "./key-address/key-address-queue.ts";
import { KeyAddressQueueService } from "./key-address/key-address-service.ts";
import { PageRequests, PageRequestsService } from "./open-pages/page-requests.ts";
import { createWorkspaceModels } from "./open-pages/workspace-models.ts";
import { providerTabTitle } from "./providers/provider-names.ts";
import {
  PROVIDER_KIND,
  PROVIDER_KIND_LABEL,
  PROVIDERS_HEADING,
} from "./providers/provider-text.ts";
import { modelsSummary } from "./settings/settings-text.ts";
import { hasProblems } from "./settings/use-problems.ts";

/** The one line the Models section shows under its name, here and on the phone. */
async function modelsLine(context: WorkspaceContext) {
  return modelsSummary(await readModels(context.services.get(ModelsFilesService)));
}

/**
 * The Models feature: providers, aliases, API keys, budget, the "Prices and
 * budget" step and the spend line. Each part registers here as it lands; the
 * interface other features use is in `api.ts`. So far it adds the **Models**
 * section of the workspace page with the alias list (`models.aliases.list`)
 * and the alias tab, the Budget block above it (`models.budget.budget-settings`), and the
 * **Providers** section with the provider page (`models.providers.list-and-show`), and the month
 * spend in the status bar (`models.spend.month-line`), and the **Models** section of Settings
 * (`models.settings.settings-summary`), and "Allow this address?" over any page
 * (`models.key-address.allow-address`). Other features open its pages through `ModelsService`
 * (`models.api-keys.open-by-secret`).
 */
export const modelsFeature = defineFeature({
  id: "models",
  title: "Models",
  needs: [ModelsFilesService],
  wants: [ModelKeysService, NoLimitMemoryService, ProviderCheckService, RunsListService],
  provides: [
    KeyAddressQueueService,
    KeyAddressQuestionsService,
    PageRequestsService,
    ModelsService,
  ],
  register(studio) {
    // One queue per open folder: its engine asks, and the dialog host draws the first question.
    studio.services.provide(KeyAddressQueueService, () => new KeyAddressQueue());
    studio.services.provide(KeyAddressQuestionsService, (services) =>
      services.get(KeyAddressQueueService),
    );
    // A service has no window, so `ModelsService` asks for pages and each window's opener opens them.
    studio.services.provide(PageRequestsService, () => new PageRequests());
    studio.services.provide(ModelsService, (services) =>
      createWorkspaceModels({
        files: services.get(ModelsFilesService),
        keys: services.find(ModelKeysService),
        requests: services.get(PageRequestsService),
      }),
    );
    studio.dialogs.add({
      id: "models.open-pages",
      order: 90,
      view: "PageOpenerHost",
      load: () => import("./open-pages/page-opener-host.tsx"),
    });
    studio.dialogs.add({
      id: "models.allow-address",
      order: 20,
      view: "AllowAddressDialogHost",
      load: () => import("./key-address/allow-address-dialog-host.tsx"),
    });
    studio.settings.add({
      id: "models",
      icon: "models",
      title: "Models",
      scope: "workspace",
      group: "agents",
      order: 10,
      // The line under the name is the summary the phone's list shows too.
      description: modelsLine,
      summary: modelsLine,
      attention: hasProblems,
      view: "ModelsSettingsSection",
      load: () => import("./settings/models-settings-section.tsx"),
    });
    studio.statusBar.add({
      id: "models.spend",
      order: 100,
      view: "SpendItem",
      load: () => import("./spend/spend-item.tsx"),
    });
    studio.itemKinds.add({
      kind: ALIAS_KIND,
      label: ALIAS_KIND_LABEL,
      icon: "settings",
      open: { view: "AliasTab", load: () => import("./aliases/alias-tab.tsx") },
      tab: { describe: (item) => ({ label: aliasTitle(item.id) }), exists: () => true },
    });
    studio.itemKinds.add({
      kind: PROVIDER_KIND,
      label: PROVIDER_KIND_LABEL,
      icon: "settings",
      open: { view: "ProviderPage", load: () => import("./providers/provider-page.tsx") },
      tab: {
        describe: (item, context) => ({
          label: providerTabTitle(context.services.find(ModelsFilesService), item.id),
        }),
        exists: () => true,
        // A tab opened before `providers/` is read shows the id; the window titles it again once the
        // names are read or change (C104 P3, HAL-12963).
        subscribe: (listener, context) => {
          const files = context.services.find(ModelsFilesService);
          return files === undefined ? () => undefined : subscribeProviderNames(files, listener);
        },
      },
    });
    studio.itemPage.addSection({
      on: "workspace",
      id: "providers",
      title: PROVIDERS_HEADING,
      order: 30,
      view: "ProvidersSection",
      load: () => import("./providers/providers-section.tsx"),
    });
    studio.itemPage.addSection({
      on: "workspace",
      id: "models",
      title: MODELS_HEADING,
      order: 20,
      view: "ModelsSection",
      load: () => import("./aliases/models-section.tsx"),
    });
  },
});
