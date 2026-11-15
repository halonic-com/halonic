import { defineFeature } from "@halonicjs/studio-shell";
import { ALIAS_KIND, ALIAS_KIND_LABEL, aliasTitle } from "./aliases/alias-text.ts";
import { ModelKeysService, ModelsFilesService } from "./api.ts";
import { PROVIDER_KIND, PROVIDER_KIND_LABEL, providerTabLabel } from "./providers/provider-text.ts";

/**
 * The Models feature: providers, aliases, API keys, budget, the "Prices and
 * budget" step and the spend line. Each part registers here as it lands; the
 * interface other features use is in `api.ts`. So far it adds the **Models**
 * section of the workspace page with the alias list (`models.aliases.list`)
 * and the alias tab, and the **Providers** section with the provider page
 * (`models.providers.list-and-show`).
 */
export const modelsFeature = defineFeature({
  id: "models",
  title: "Models",
  needs: [ModelsFilesService],
  wants: [ModelKeysService],
  register(studio) {
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
      tab: { describe: (item) => ({ label: providerTabLabel(item.id) }), exists: () => true },
    });
    studio.itemPage.addSection({
      on: "workspace",
      id: "providers",
      order: 30,
      view: "ProvidersSection",
      load: () => import("./providers/providers-section.tsx"),
    });
    studio.itemPage.addSection({
      on: "workspace",
      id: "models",
      order: 20,
      view: "ModelsSection",
      load: () => import("./aliases/models-section.tsx"),
    });
  },
});
