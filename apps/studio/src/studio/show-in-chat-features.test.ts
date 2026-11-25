import {
  AssistantHostService,
  ItemChatService,
  ShowInChatService,
} from "@halonicjs/studio-feature-assistant/api";
import { libraryFeature } from "@halonicjs/studio-feature-library";
import { limitedLookup } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { desktopFeatures } from "./desktop-features.ts";

verifies("assistant.chat.show-in-chat", () => {
  it("lets only agents and workflows offer Show in chat", () => {
    const offering = desktopFeatures.features
      .filter((feature) => feature.wants.some((key) => key.name === ShowInChatService.name))
      .map((feature) => feature.id);
    expect(offering.sort()).toEqual(["agents", "workflows"]);
  });

  it("gives a skill row's ⋮ no Show in chat: the library can't reach the service", () => {
    const services = limitedLookup(libraryFeature, { get: () => undefined, find: () => undefined });
    expect(() => services.find(ShowInChatService)).toThrow(/doesn't list it in needs or wants/);
  });
});

verifies("assistant.chat.item-page", () => {
  it("keeps the Assistant's host from the features that use its chats, as its tests' stand-ins do", () => {
    const users = desktopFeatures.features.filter((feature) =>
      feature.wants.some(
        (key) => key.name === ItemChatService.name || key.name === ShowInChatService.name,
      ),
    );
    expect(users.map((feature) => feature.id).sort()).toEqual(["agents", "library", "workflows"]);
    for (const feature of users) {
      const services = limitedLookup(feature, { get: () => undefined, find: () => undefined });
      expect(() => services.find(AssistantHostService)).toThrow(
        /doesn't list it in needs or wants/,
      );
    }
  });
});
