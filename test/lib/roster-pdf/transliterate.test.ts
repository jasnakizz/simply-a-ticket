import { describe, it, expect } from "vitest";

import { serbianCyrillicToAsciiLatin } from "@/lib/roster-pdf/transliterate";

/**
 * The Serbian-Cyrillic -> ASCII-Latin table (D-08), the `filename=` fallback's
 * romaniser. `test/lib/` unit-battery style (cf. amount.test.ts): behavioural
 * assertions on a pure function, one concept per `it`.
 *
 * Break-checks for the load-bearing `it`s are recorded in 25-01-SUMMARY.md.
 */

describe("serbianCyrillicToAsciiLatin", () => {
  it("maps every Cyrillic letter of the Serbian alphabet to its documented Latin form", () => {
    // The canonical Gaj's-Latin correspondence, folded to plain ASCII.
    const pairs: Array<[string, string]> = [
      ["А", "A"], ["Б", "B"], ["В", "V"], ["Г", "G"], ["Д", "D"], ["Ђ", "Dj"],
      ["Е", "E"], ["Ж", "Z"], ["З", "Z"], ["И", "I"], ["Ј", "J"], ["К", "K"],
      ["Л", "L"], ["Љ", "Lj"], ["М", "M"], ["Н", "N"], ["Њ", "Nj"], ["О", "O"],
      ["П", "P"], ["Р", "R"], ["С", "S"], ["Т", "T"], ["Ћ", "C"], ["У", "U"],
      ["Ф", "F"], ["Х", "H"], ["Ц", "C"], ["Ч", "C"], ["Џ", "Dz"], ["Ш", "S"],
    ];
    for (const [cyr, lat] of pairs) {
      expect(serbianCyrillicToAsciiLatin(cyr)).toBe(lat);
      expect(serbianCyrillicToAsciiLatin(cyr.toLowerCase())).toBe(
        lat.toLowerCase(),
      );
    }
  });

  it("expands the three digraph letters to two characters and does not shred them into component letters", () => {
    expect(serbianCyrillicToAsciiLatin("Љубав")).toBe("Ljubav");
    expect(serbianCyrillicToAsciiLatin("Његош")).toBe("Njegos");
    expect(serbianCyrillicToAsciiLatin("Џеза")).toBe("Dzeza");
    // не "L" + "j" from a separate Л and ј — the whole digraph maps in one step
    expect(serbianCyrillicToAsciiLatin("љ")).toBe("lj");
    expect(serbianCyrillicToAsciiLatin("њ")).toBe("nj");
    expect(serbianCyrillicToAsciiLatin("џ")).toBe("dz");
  });

  it("transliterates only the Cyrillic part of a mixed Cyrillic/Latin string", () => {
    expect(serbianCyrillicToAsciiLatin("Ana Јовановић 2026")).toBe(
      "Ana Jovanovic 2026",
    );
  });

  it("folds diacritic Latin letters to plain ASCII", () => {
    expect(serbianCyrillicToAsciiLatin("Đorđe Šišić Žarko Ćira Čačak")).toBe(
      "Djordje Sisic Zarko Cira Cacak",
    );
  });

  it("returns plain-ASCII input unchanged", () => {
    expect(serbianCyrillicToAsciiLatin("Belgrade Jazz Night 2026")).toBe(
      "Belgrade Jazz Night 2026",
    );
  });

  it("returns the empty string for the empty string", () => {
    expect(serbianCyrillicToAsciiLatin("")).toBe("");
  });

  it("Београд -> Beograd", () => {
    expect(serbianCyrillicToAsciiLatin("Београд")).toBe("Beograd");
  });
});
