// The host endings under which a name is registered one level deeper, such
// as `co.uk`: under them, the main part of a host is its last three labels
// (`example.co.uk`), not two. A short list we keep ourselves, without a
// public-suffix library (Liam, HAL-19172 question 2). Add an ending here
// when a real service sits under one; each entry has its own test.

/** Two-label endings, in their ASCII form, in lower case. */
export const twoPartEndings: ReadonlySet<string> = new Set([
  // United Kingdom
  "co.uk",
  "org.uk",
  "me.uk",
  "ltd.uk",
  "plc.uk",
  "net.uk",
  "ac.uk",
  "gov.uk",
  // Australia and New Zealand
  "com.au",
  "net.au",
  "org.au",
  "edu.au",
  "gov.au",
  "co.nz",
  "net.nz",
  "org.nz",
  // Asia
  "co.jp",
  "ne.jp",
  "or.jp",
  "ac.jp",
  "co.kr",
  "or.kr",
  "com.cn",
  "net.cn",
  "org.cn",
  "com.hk",
  "com.tw",
  "com.sg",
  "com.my",
  "co.in",
  "net.in",
  "org.in",
  "co.id",
  "co.th",
  "com.ph",
  "com.vn",
  "co.il",
  // Americas
  "com.br",
  "net.br",
  "com.mx",
  "com.ar",
  "com.co",
  // Europe, Africa and the Middle East
  "com.tr",
  "com.ua",
  "co.za",
  "org.za",
  "com.ng",
  "com.eg",
  "com.sa",
]);
