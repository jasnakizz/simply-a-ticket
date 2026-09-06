// Build the `Content-Disposition` header value for the roster download
// (PDF-03, D-07, D-08).
//
// Why TWO filename parameters. `Content-Disposition` predates Unicode headers,
// so its plain `filename="..."` parameter is ASCII-only. RFC 5987 later added
// `filename*=UTF-8''<percent-encoded>` to carry any Unicode name. A browser
// that understands `filename*` uses it and ignores `filename=`; an older one
// falls back to `filename=`. So we emit both: `filename*` carries the real
// (possibly Cyrillic) event name exactly, and `filename=` carries a
// transliterated, sanitised ASCII approximation.
//
// Security (threat T-25-01): the event name is operator-entered — treat it as
// untrusted. A raw CR or LF in it would split the HTTP response header; a raw
// `"` would break out of the `filename="..."` quoting. `asciiSafe` strips the
// C0 control range, DEL and the double quote before the value is emitted, and
// `rfc5987` percent-encodes the `filename*` value. A ./transliterate table
// import is the only dependency.
import { serbianCyrillicToAsciiLatin } from "./transliterate";

// RFC 5987 `attr-char` grammar: percent-encode the UTF-8 bytes.
// `encodeURIComponent` already does that for most characters but leaves
// `' ( ) *` literal, which the grammar forbids — escape those four by hand.
function rfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

// Turn an event name into a filename-friendly slug: collapse whitespace runs to
// a single hyphen and replace path separators with hyphens. Other characters
// are left for `asciiSafe` (fallback) or `rfc5987` (real name) to handle.
function slug(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[/\\]/g, "-");
}

// Strip anything that could break the HTTP header or the quoted filename value,
// then anything non-ASCII, then leading/trailing hyphens. If nothing printable
// survives, fall back to the literal "attendees" so `filename=` is never empty.
function asciiSafe(name: string): string {
  return (
    name
      .replace(/[\x00-\x1f\x7f]/g, "") // C0 control range + DEL (incl. CR/LF)
      .replace(/"/g, "") // the double quote delimits filename="..."
      .replace(/[^\x20-\x7e]/g, "") // drop any remaining non-ASCII
      .replace(/^-+|-+$/g, "") || "attendees"
  );
}

export function rosterContentDisposition(eventName: string): string {
  const utf8Name = `${slug(eventName)}-attendees.pdf`;
  const asciiName = `${asciiSafe(
    slug(serbianCyrillicToAsciiLatin(eventName)),
  )}-attendees.pdf`;
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${rfc5987(utf8Name)}`;
}
