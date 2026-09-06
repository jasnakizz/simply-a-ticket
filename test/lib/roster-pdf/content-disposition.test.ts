import { describe, it, expect } from "vitest";

import { rosterContentDisposition } from "@/lib/roster-pdf/content-disposition";

/**
 * rosterContentDisposition() — the roster download's Content-Disposition value
 * (PDF-03, D-07, D-08) and the threat T-25-01 mitigation (no CR/LF/control/`"`
 * in the emitted header).
 *
 * Break-checks for the load-bearing `it`s are recorded in 25-01-SUMMARY.md.
 */

describe("rosterContentDisposition", () => {
  it("always begins with the attachment disposition type", () => {
    for (const name of ["Belgrade Jazz Night", "Београд", "", "!!!"]) {
      expect(rosterContentDisposition(name).startsWith("attachment;")).toBe(true);
    }
  });

  it("a plain Latin name gets both an ASCII filename= and an RFC 5987 filename*=UTF-8'' parameter, both ending -attendees.pdf", () => {
    const header = rosterContentDisposition("Belgrade Jazz Night");
    const ascii = /filename="([^"]+)"/.exec(header);
    const star = /filename\*=UTF-8''(\S+)/.exec(header);
    expect(ascii).not.toBeNull();
    expect(star).not.toBeNull();
    expect(ascii![1]).toBe("Belgrade-Jazz-Night-attendees.pdf");
    expect(ascii![1].endsWith("-attendees.pdf")).toBe(true);
    expect(decodeURIComponent(star![1])).toBe(
      "Belgrade-Jazz-Night-attendees.pdf",
    );
    expect(star![1].endsWith("-attendees.pdf")).toBe(true);
  });

  it("a Cyrillic name gets a transliterated Latin ASCII fallback and a percent-encoded filename*", () => {
    const header = rosterContentDisposition("Београд");
    const ascii = /filename="([^"]+)"/.exec(header)![1];
    const star = /filename\*=UTF-8''(\S+)/.exec(header)![1];
    expect(ascii).toBe("Beograd-attendees.pdf");
    // the real name survives, percent-encoded, in filename*
    expect(star).toContain("%D0%91"); // 'Б'
    expect(decodeURIComponent(star)).toBe("Београд-attendees.pdf");
  });

  it("strips CR, LF and the double quote from the emitted header (threat T-25-01)", () => {
    const CR = String.fromCharCode(13);
    const LF = String.fromCharCode(10);
    const QUOTE = String.fromCharCode(34);
    const hostile = `Evil${CR}${LF}Set-Cookie: x=1${QUOTE} name`;
    const header = rosterContentDisposition(hostile);
    // assert on the ABSENCE of the raw characters by code, not on any literal
    for (const code of [13, 10]) {
      expect(header.split("").some((c) => c.charCodeAt(0) === code)).toBe(false);
    }
    // the double quote appears ONLY as the two filename="..." delimiters
    expect((header.match(/"/g) ?? []).length).toBe(2);
    // no other C0 control char or DEL leaked through either
    expect(
      header.split("").some((c) => {
        const n = c.charCodeAt(0);
        return (n >= 0 && n <= 31) || n === 127;
      }),
    ).toBe(false);
  });

  it("a name of only punctuation still yields a non-empty ASCII filename", () => {
    const ascii = /filename="([^"]*)"/.exec(rosterContentDisposition("!!! ??? ..."))![1];
    expect(ascii.length).toBeGreaterThan(0);
    expect(ascii.endsWith("-attendees.pdf")).toBe(true);
  });

  it("a name that reduces to nothing printable falls back to the literal attendees", () => {
    const ctrlOnly = String.fromCharCode(1, 2, 3, 127);
    const ascii = /filename="([^"]*)"/.exec(rosterContentDisposition(ctrlOnly))![1];
    expect(ascii).toBe("attendees-attendees.pdf");
  });
});
