// 256 short, distinct words, so each word is one random byte and a phrase of
// four carries 32 bits: someone who sends the board their own approval link
// can't guess the phrase Studio shows.
const phraseWords: readonly string[] = [
  "acorn amber anchor apple arrow aspen atlas autumn",
  "badge bamboo banjo barley basil beacon berry birch",
  "bison blossom bonnet border bramble breeze brick bridge",
  "brook bucket butter cabin cactus camel candle canoe",
  "canyon carrot castle cedar cello chalk cherry chess",
  "cinder circle clover cobalt comet copper coral cotton",
  "cougar crane crater cricket crystal cypress daisy dawn",
  "delta denim desert dingo dolphin dome dragon drum",
  "dune eagle ember emerald falcon fern ferry fiddle",
  "fig finch fjord flame flute forest fossil fox",
  "galaxy garden garnet gecko geyser ginger glacier globe",
  "granite grape gravel harbor harp hazel heron hickory",
  "hill honey horizon hornet iris island ivory jade",
  "jasmine jelly jungle juniper kayak kelp kettle kiwi",
  "koala lagoon lantern larch lava lemon lily linen",
  "lizard llama lobster lotus lunar lynx magnet mango",
  "maple marble meadow melon mesa meteor mint mirror",
  "mist molten monsoon moose mosaic moss mountain mule",
  "nectar nickel nimbus noodle nutmeg oak oasis ocean",
  "olive onyx orange orbit orchid osprey otter owl",
  "paddle panda paper parrot peach pebble pelican pepper",
  "pine planet plum polar pond poppy prairie prism",
  "puffin pumpkin quail quartz quill rabbit radish rain",
  "raven reef ribbon ridge river robin rocket rose",
  "ruby saddle saffron sage salmon sapphire satin sequoia",
  "shadow shell sierra silver slate sparrow spruce squash",
  "starling stone storm summit sunset swan tango thistle",
  "thunder tiger timber toffee topaz tulip tundra turnip",
  "umber valley velvet violet volcano wagon walnut walrus",
  "wave willow window winter wolf wren yarrow yew",
  "zebra zenith zinc zephyr alpaca badger beetle buffalo",
  "cobra dove gull hawk ibis jackal lemur mantis",
].flatMap((line) => line.split(" "));

/** How many words a sign-in phrase has. */
export const phraseWordCount = 4;

/** The words a phrase is made of, for tests. */
export const signInPhraseWords = phraseWords;

/**
 * A random phrase of {@link phraseWordCount} words, such as "otter maple
 * quartz dawn". The engine puts it in the challenge's `command`, which the
 * approval page shows, and Studio shows the same phrase, so the board
 * approves only the request Studio just opened.
 */
export function newSignInPhrase(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(phraseWordCount));
  return Array.from(bytes, wordAt).join(" ");
}

function wordAt(index: number): string {
  const word = phraseWords[index];
  if (word === undefined) throw new RangeError(`No phrase word at ${index}`);
  return word;
}
