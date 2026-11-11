import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { paintFor } from "../output/paint.ts";
import type { Message } from "./define.ts";
import { plainText, renderPhrase } from "./phrase.ts";
import { pluginMessages } from "./plugin.ts";

const words = (message: Message) => plainText(message.phrase);

verifies("cli.messages", () => {
  it("has plugin remove's question and answers word for word, from cli-output 3.6", () => {
    expect(pluginMessages.removeQuestion("Weather", true).key).toBe("plugin.removeQuestion");
    expect(words(pluginMessages.removeQuestion("Weather", true))).toBe(
      "Remove Weather? Its settings and the API key you entered are removed from this computer.",
    );
    expect(words(pluginMessages.removed("Weather", "1.2.0"))).toBe(
      "Removed Weather 1.2.0 and its trust.",
    );
    expect(words(pluginMessages.removeNoTerminal("Weather"))).toBe(
      "Removing Weather deletes its settings and secrets, and there's no terminal to ask you.",
    );
    expect(words(pluginMessages.removeNoTerminalFix())).toBe("To remove it anyway, pass --yes.");
  });

  it("leaves a plugin added but off when there's no terminal to ask", () => {
    expect(words(pluginMessages.addNoTerminal("Weather"))).toBe(
      "Weather is added but off, because there's no terminal to ask you to trust it.",
    );
    expect(words(pluginMessages.addNoTerminalFix("weather"))).toBe(
      "Review it with halonic trust --plugin weather, then pass --yes --fingerprint <fingerprint>.",
    );
  });
});

describe("plugin's sentences", () => {
  it("has the summary", () => {
    expect(words(pluginMessages.summary())).toBe("Add or list plugins");
  });

  it("has add's lines", () => {
    expect([
      words(pluginMessages.copying("weather", "3f2c1ab")),
      words(pluginMessages.latestCommit("3f2c1ab", "main")),
      words(pluginMessages.trustQuestion("Weather")),
      words(pluginMessages.added("Weather", "1.2.0")),
      words(pluginMessages.addedButOff("Weather", "weather")),
      words(pluginMessages.addAction()),
      words(pluginMessages.refusedSourceFix()),
    ]).toEqual([
      "Copying weather at 3f2c1ab into your plugins folder…",
      "Using commit 3f2c1ab, the latest on main. Add @3f2c1ab to pin it.",
      "Trust Weather and turn it on?",
      "Added Weather 1.2.0. It's on.",
      "Weather is added but off. Nothing from it runs until you trust it: halonic trust --plugin weather",
      "add the plugin",
      "Check the folder.",
    ]);
  });

  it("has the trust check's headings in Studio's words and order", () => {
    expect([
      words(pluginMessages.toolsHeading()),
      words(pluginMessages.reads()),
      words(pluginMessages.changesThings()),
      words(pluginMessages.sends()),
      words(pluginMessages.asksFirst()),
      words(pluginMessages.programsHeading()),
      words(pluginMessages.secretsHeading()),
      words(pluginMessages.secretGoesTo("api.weather.example")),
      words(pluginMessages.addressesHeading()),
      words(pluginMessages.notChecked()),
    ]).toEqual([
      "Tools for agents",
      "Reads",
      "Changes things",
      "Sends",
      "asks a person first",
      "Programs on this computer",
      "Secrets",
      "goes only to api.weather.example",
      "Addresses",
      "Plugin code runs apart from the rest of Halonic. Halonic doesn't check what the plugin does with what it's given.",
    ]);
  });

  it("has list's states in Studio's words, with the trust command after those that need it", () => {
    expect(words(pluginMessages.state("on"))).toBe("on");
    expect(words(pluginMessages.stateWithFix("notTrusted", "tides"))).toBe(
      "not trusted yet · halonic trust --plugin tides",
    );
    const oldConsole = paintFor({ colour: false, live: false, unicode: false });
    expect(renderPhrase(pluginMessages.stateWithFix("changed", "notes").phrase, oldConsole)).toBe(
      "changed since you trusted it - halonic trust --plugin notes",
    );
    expect(words(pluginMessages.noPlugins())).toBe(
      "No plugins yet. Add one from a folder with halonic plugin add <folder>.",
    );
  });

  it("has remove's other lines", () => {
    expect(words(pluginMessages.removeQuestion("Weather", false))).toBe(
      "Remove Weather? Its settings are removed from this computer.",
    );
    expect(words(pluginMessages.notRemoved("Weather"))).toBe(
      "Not removed. Weather is still added.",
    );
    expect(words(pluginMessages.removeHelp())).toBe(
      "Removes the plugin and its settings and secrets. To only turn it off: halonic trust --plugin <id> --remove",
    );
    expect(words(pluginMessages.unknownPlugin("wether"))).toBe(
      'There\'s no plugin called "wether".',
    );
    expect(words(pluginMessages.unknownPluginNear("wether", "weather"))).toBe(
      'There\'s no plugin called "wether". Did you mean weather?',
    );
    expect(words(pluginMessages.unknownPluginFix())).toBe("See them with halonic plugin list.");
  });
});
