// Serbian Cyrillic -> ASCII-Latin, for the Content-Disposition `filename=`
// fallback only (D-08).
//
// The table is hand-written on purpose: pulling an npm transliteration package
// for ~30 rows would spend PDF-09's exactly-one-dependency budget on a lookup a
// Java developer would recognise as a HashMap. Serbian romanisation (Gaj's
// Latin) is a near 1:1 alphabet correspondence, so the table is small and
// stable.
//
// The ASCII fold is DELIBERATELY LOSSY: `Ж` and `З` both become `Z`; `Ц`, `Ч`
// and `Ћ` all become `C`. That is fine — the fallback only has to stay a
// *meaningful* filename for old download clients. The real, exact event name
// rides in the `filename*=UTF-8''...` parameter (see ./content-disposition).
//
// Digraph letters (`Љ Њ Џ`) are listed first only for readability; lookup is
// per code point, so order does not actually matter here — each Cyrillic code
// point maps to its whole Latin string in one step.
const MAP: Record<string, string> = {
  // digraph letters
  Љ: "Lj",
  љ: "lj",
  Њ: "Nj",
  њ: "nj",
  Џ: "Dz",
  џ: "dz",
  // single letters
  А: "A",
  а: "a",
  Б: "B",
  б: "b",
  В: "V",
  в: "v",
  Г: "G",
  г: "g",
  Д: "D",
  д: "d",
  Ђ: "Dj",
  ђ: "dj",
  Е: "E",
  е: "e",
  Ж: "Z",
  ж: "z",
  З: "Z",
  з: "z",
  И: "I",
  и: "i",
  Ј: "J",
  ј: "j",
  К: "K",
  к: "k",
  Л: "L",
  л: "l",
  М: "M",
  м: "m",
  Н: "N",
  н: "n",
  О: "O",
  о: "o",
  П: "P",
  п: "p",
  Р: "R",
  р: "r",
  С: "S",
  с: "s",
  Т: "T",
  т: "t",
  Ћ: "C",
  ћ: "c",
  У: "U",
  у: "u",
  Ф: "F",
  ф: "f",
  Х: "H",
  х: "h",
  Ц: "C",
  ц: "c",
  Ч: "C",
  ч: "c",
  Ш: "S",
  ш: "s",
  // Latin-script names typed with diacritics also need folding to plain ASCII
  Đ: "Dj",
  đ: "dj",
  Ž: "Z",
  ž: "z",
  Ć: "C",
  ć: "c",
  Č: "C",
  č: "c",
  Š: "S",
  š: "s",
};

// Walk by code point (a `for...of` over a string iterates code points, not
// UTF-16 units), substituting from the table and passing anything unmapped
// through unchanged.
export function serbianCyrillicToAsciiLatin(input: string): string {
  let out = "";
  for (const ch of input) {
    out += MAP[ch] ?? ch;
  }
  return out;
}
