/**
 * The vectors and broken hashes of one `PasswordHasher` format, taken from
 * that format's requirement in `core/ports`, where a test recomputes the
 * vectors with an independent implementation.
 */
export interface PasswordHashFormatCases {
  /** The format's requirement, which these cases verify. */
  readonly requirement: string;
  /** What a new hash looks like, with the current settings. */
  readonly newHash: RegExp;
  /** Passwords and the hashes they verify against. */
  readonly matching: readonly PasswordAndHash[];
  /** A wrong password for a valid hash. */
  readonly wrongPassword: PasswordAndHash;
  /** A hash with settings in range but not the current ones: it verifies, and needs a rehash. */
  readonly olderSettings: PasswordAndHash;
  /** Hashes whose settings are out of range: `RangeError`, saying so. */
  readonly outOfRange: readonly string[];
  /** Malformed hashes of this format: `RangeError`, saying so. */
  readonly malformed: readonly string[];
  /** Hashes in other formats, the port's other format included: `RangeError`, never `false`. */
  readonly otherFormats: readonly string[];
}

/** A password and a hash made from it (or, for a wrong password, not). */
export interface PasswordAndHash {
  readonly password: string;
  readonly hash: string;
}

// Typed with combining diaeresis (U+0308): verifying proves the adapter
// normalises to NFC, since the vector was made from the composed form.
const umlaut = String.fromCodePoint(0x308);

/** Salt `00 01 … 0f` in the format's base64. */
const salt = "AAECAwQFBgcICQoLDA0ODw";
const stapleHash = "rfDFKdlz6hQsDnqes4jawGjfp+mn20j77PR84Xj0KfE";
const chainPrefix = "$pbkdf2-sha256-chain$";

/** Hashes the PBKDF2 chain rule refuses, with its own vector's salt and hash. */
function chainHash(settings: string, saltText = salt, hashText = stapleHash): string {
  return `${chainPrefix}${settings}$${saltText}$${hashText}`;
}

/** The cases of `ports.password-hash-format-pbkdf2-chain` (HAL-136, cloud targets). */
export const pbkdf2ChainFormat: PasswordHashFormatCases = {
  requirement: "ports.password-hash-format-pbkdf2-chain",
  newHash: /^\$pbkdf2-sha256-chain\$i=100000,n=6\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/,
  matching: [
    { password: "correct horse battery staple", hash: chainHash("i=100000,n=6") },
    {
      password: `pa${umlaut}sswo${umlaut}rd fu${umlaut}r halonic`,
      hash: chainHash("i=100000,n=6", salt, "ZxsiFH9QDVVYBRBEH1XLiBBMY48mu5N51MaOKGYfrNI"),
    },
  ],
  wrongPassword: { password: "correct horse battery stapler", hash: chainHash("i=100000,n=6") },
  olderSettings: {
    password: "correct horse battery staple",
    hash: chainHash("i=100000,n=7", salt, "EDbbXUxT44YDF0NbM0rrUM1/M3pBYo7Vh+dtc81qGUA"),
  },
  outOfRange: [
    chainHash("i=100000,n=5"),
    chainHash("i=100000,n=21"),
    chainHash("i=99999,n=6"),
    chainHash("i=200000,n=6"),
  ],
  malformed: [
    chainHash("i=100000,n=6", `${salt}=`),
    chainHash("i=100000,n=6", "AAECAwQFBgcICQoLDA0O"),
    chainHash("i=100000,n=6", salt, "rfDFKdlz6hQsDnqes4jawGjfp+mn20j77PR84Xj0KQ"),
    chainHash("n=6,i=100000"),
    chainHash("i=100000,n=06"),
  ],
  otherFormats: [
    "$scrypt$ln=14,r=8,p=5$AAECAwQFBgcICQoLDA0ODw$D7lSJtJDGLLVcrxL7dWjkoRxbs+pMvcVYIJ+gbuyltk",
    `$pbkdf2-sha256$i=100000$${salt}$${stapleHash}`,
    "not a hash",
  ],
};
