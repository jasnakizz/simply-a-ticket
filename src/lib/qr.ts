import "server-only";

// One QR generation path for the whole app, in the style of src/lib/date.ts:
// a small pure module, a named export per concern, no default export, no class.
//
// QR encoding lives on the server for two reasons. A browser-side encoder
// would let the client decide what actually goes into the code — it must be
// exactly the opaque `qr_token` and nothing else (no id, no URL, no attendee
// data). And this module is the single place the token -> image mapping is
// defined, so both consumers (the emailed attachment and the on-screen image
// on the confirmation page) stay in lockstep.
//
// Note for anyone cross-checking .claude/CLAUDE.md: that guide suggests
// `QRCode.toBuffer()` for the emailed PNG. That method does not exist on the
// `qrcode` package (its Node API is create/toCanvas/toDataURL/toString/
// toFile/toFileStream). `toDataURL` is the correct call and is less code:
// the confirmation page needs a data URL for its <img> anyway, and the email
// attachment's base64 payload is just the part of that same string after the
// comma.
import QRCode from "qrcode";

// A data URL from QRCode.toDataURL() always starts with this exact prefix
// (PNG is the package default). qrDataUrlToBase64 asserts it rather than
// blindly splitting on "," so a malformed value fails loudly in a server log
// instead of silently becoming an unreadable inbox attachment.
const PNG_DATA_URL_PREFIX = "data:image/png;base64,";

// 320 is the UI-SPEC's on-screen QR size and scans comfortably from a phone
// at arm's length without bloating the email. `margin: 2` keeps the QR quiet
// zone so a camera can lock on. `token` is encoded verbatim — nothing else.
export async function generateQrDataUrl(token: string): Promise<string> {
  return QRCode.toDataURL(token, { width: 320, margin: 2 });
}

// The base64 payload Resend's attachment `content` field expects is exactly
// the data URL with its `data:image/png;base64,` prefix removed.
export function qrDataUrlToBase64(dataUrl: string): string {
  if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX)) {
    throw new Error(
      "qrDataUrlToBase64: expected a PNG base64 data URL from QRCode.toDataURL"
    );
  }
  return dataUrl.slice(PNG_DATA_URL_PREFIX.length);
}
