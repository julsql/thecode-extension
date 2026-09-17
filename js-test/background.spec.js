const { 
  generatePassword, 
  buildCharset, 
  calculateEntropyBits, 
  getSecurityLevel, 
  convertToBase, 
  applyCharsetReplacement, 
  getUniquePosition, 
  hashToBigInt,
  normalizeParams,
  clampLength,
  DEFAULT_PARAMS,
  MIN_LENGTH,
  MAX_LENGTH
} = require('../background');

const totalBase = [
  "portezcviuxwhskyajgblndqfm",
  "THEQUICKBROWNFXJMPSVLAZYDG",
  "@#&!)-%;<:*$+=/?>(",
  "567438921"
];

describe("generatePassword", () => {
  it("devrait générer un mot de passe avec toutes les options activées", async () => {
    const result = await generatePassword('site', 'clef', 20, true, true, true, true);
    expect(result).toMatchObject({
      security: "Très Forte",
      bits: expect.any(Number),
      color: "#1CD001"
    });

    // Vérifie la longueur
    expect(result.mdp).toHaveLength(20);
    expect(result.mdp).toBe("u8YfpdVdK*#Bpy6(9f*5");

    // Vérifie qu'au moins un caractère de chaque groupe est présent
    const groups = totalBase;
    groups.forEach(group => {
      expect(group.split("").some(c => result.mdp.includes(c))).toBe(true);
    });
  });
});

describe("buildCharset", () => {
  test.each([
    [true, true, true, true, totalBase],
    [true, false, true, false, ["portezcviuxwhskyajgblndqfm", "@#&!)-%;<:*$+=/?>("]],
    [false, false, false, false, []],
  ])("avec min=%s, maj=%s, sym=%s, chi=%s => base attendue", 
  (min, maj, sym, chi, expected) => {
    expect(buildCharset(min, maj, sym, chi)).toStrictEqual(expected);
  });
});

describe("calculateEntropyBits", () => {
  test.each([
    [totalBase, 20, 126],
    [totalBase, 10, 63],
  ])('base=%p et longueur=%i => bits=%i', (base, length, expected) => {
    expect(calculateEntropyBits(base, length)).toBe(expected);
  });
});

describe("getSecurityLevel", () => {
  test.each([
    [126, "Très Forte", "#1CD001"],
    [63, "Très Faible", "#FE0101"],
    [0, "Aucune", "#FE0101"]
  ])('%i bits => %s avec couleur %s', (bits, expectedSecurity, expectedColor) => {
    expect(getSecurityLevel(bits)).toStrictEqual({ security: expectedSecurity, color: expectedColor });
  });
});

describe("convertToBase", () => {
  test.each([
    [1, ["abc"], "b"],
    [0, ["abc"], "a"],
    [2, ["01"], "00"]
  ])('%i en base %p => %s', (x, base, expected) => {
    expect(convertToBase(x, base)).toBe(expected);
  });
});

describe("applyCharsetReplacement", () => {
  it("garantit qu'au moins un caractère de chaque groupe est présent", () => {
    const seed = 123456789n;
    const charsetGroups = ["abc", "XYZ", "123"];
    const password = "aaaaaaaaa";

    const result = applyCharsetReplacement(seed, password, charsetGroups);
    expect(result.length).toBe(password.length);
    charsetGroups.forEach(group => {
      expect(group.split("").some(c => result.includes(c))).toBe(true);
    });
  });

  it("lance une erreur si le mot de passe est trop court", () => {
    const seed = 1n;
    const charsetGroups = ["abc", "XYZ", "123"];
    const password = "ab";

    expect(() => applyCharsetReplacement(seed, password, charsetGroups))
      .toThrow(/Password must have at least/);
  });
});

describe("getUniquePosition", () => {
  it("retourne une position unique dans la longueur donnée", () => {
    const seed = 5n;
    const usedPositions = [0, 1, 2];
    const length = 5;
    const pos = getUniquePosition(seed, usedPositions, length);

    expect(pos).toBeGreaterThanOrEqual(0);
    expect(pos).toBeLessThan(length);
    expect(usedPositions.includes(pos)).toBe(false);
  });

  it("boucle si toutes les positions inférieures sont utilisées", () => {
    const seed = 3n;
    const usedPositions = [0, 1, 2, 3];
    const length = 5;

    const pos = getUniquePosition(seed, usedPositions, length);
    expect(pos).toBe(4);
  });
});

describe("hashToBigInt", () => {
  it("retourne un BigInt correct pour une chaîne donnée", async () => {
    const input = "test";
    const expectedHex =
      "9f86d081884c7d659a2feaa0c55ad015" +
      "a3bf4f1b2b0b822cd15d6c15b0f00a08";
    const expectedBigInt = BigInt("0x" + expectedHex);

    const result = await hashToBigInt(input);
    expect(typeof result).toBe("bigint");
    expect(result).toBe(expectedBigInt);
  });

  it("produit des valeurs différentes pour des entrées différentes", async () => {
    const hash1 = await hashToBigInt("hello");
    const hash2 = await hashToBigInt("world");
    expect(hash1).not.toBe(hash2);
  });
});

describe("clampLength", () => {
  it("borne en dessous du minimum", () => {
    expect(clampLength(1)).toBe(MIN_LENGTH);
  });

  it("borne au-dessus du maximum", () => {
    expect(clampLength(99)).toBe(MAX_LENGTH);
  });

  it("accepte une valeur dans les bornes, y compris en chaîne", () => {
    expect(clampLength(30)).toBe(30);
    expect(clampLength("30")).toBe(30);
  });

  it("retombe sur la valeur par défaut si la saisie n'est pas un nombre", () => {
    expect(clampLength("")).toBe(DEFAULT_PARAMS.lengthNumber);
    expect(clampLength(undefined)).toBe(DEFAULT_PARAMS.lengthNumber);
  });
});

describe("normalizeParams", () => {
  it("applique les valeurs par défaut quand rien n'est stocké", () => {
    expect(normalizeParams({})).toEqual(DEFAULT_PARAMS);
    expect(normalizeParams()).toEqual(DEFAULT_PARAMS);
  });

  it("conserve une longueur réglée par l'utilisateur", () => {
    expect(normalizeParams({ lengthNumber: 30 }).lengthNumber).toBe(30);
  });

  it("migre les anciennes clés de stockage", () => {
    // « lenghtNumber » (faute historique) et « length » (clé écrite par la
    // popup d'une version précédente) doivent rester lisibles.
    expect(normalizeParams({ lenghtNumber: 30 }).lengthNumber).toBe(30);
    expect(normalizeParams({ length: 28 }).lengthNumber).toBe(28);
  });

  it("donne la priorité à la clé courante sur les clés héritées", () => {
    expect(normalizeParams({ lengthNumber: 30, length: 12 }).lengthNumber).toBe(30);
  });

  it("préserve un booléen explicitement à false", () => {
    const p = normalizeParams({ symState: false, chiState: false });
    expect(p.symState).toBe(false);
    expect(p.chiState).toBe(false);
    expect(p.minState).toBe(true);
  });
});

describe("generatePassword - longueur", () => {
  it("respecte une longueur de 30", async () => {
    const result = await generatePassword('site', 'clef', 30, true, true, true, true);
    expect(result.mdp).toHaveLength(30);
  });

  it("borne une longueur hors limites au lieu de produire n'importe quoi", async () => {
    expect((await generatePassword('site', 'clef', 99, true, true, true, true)).mdp)
      .toHaveLength(MAX_LENGTH);
    expect((await generatePassword('site', 'clef', 1, true, true, true, true)).mdp)
      .toHaveLength(MIN_LENGTH);
  });
});
