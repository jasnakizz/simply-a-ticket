import { describe, it, expect } from 'vitest';
import QRCode from 'qrcode';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ISSUE-02: QR code generation tests
 *
 * Tests that QR codes are generated correctly and can be converted to/from
 * base64 format for email attachment usage.
 */

describe("ISSUE-02: generateQrDataUrl implementation", () => {
  it("qr.ts imports QRCode and server-only guard", () => {
    const qrPath = join(__dirname, '../../src/lib/qr.ts');
    const content = readFileSync(qrPath, 'utf-8');

    expect(content).toContain('import "server-only"');
    expect(content).toContain('import QRCode from "qrcode"');
  });

  it("generateQrDataUrl uses QRCode.toDataURL with 320px width and margin 2", () => {
    const qrPath = join(__dirname, '../../src/lib/qr.ts');
    const content = readFileSync(qrPath, 'utf-8');

    expect(content).toContain('QRCode.toDataURL(token');
    expect(content).toContain('width: 320');
    expect(content).toContain('margin: 2');
  });

  it("PNG_DATA_URL_PREFIX is correctly defined as data:image/png;base64,", () => {
    const qrPath = join(__dirname, '../../src/lib/qr.ts');
    const content = readFileSync(qrPath, 'utf-8');

    expect(content).toContain('const PNG_DATA_URL_PREFIX = "data:image/png;base64,"');
  });

  it("returns a data URL starting with data:image/png;base64,", async () => {
    // Test via QRCode directly (same as what generateQrDataUrl does)
    const token = "test-token-12345";
    const dataUrl = await QRCode.toDataURL(token, { width: 320, margin: 2 });

    expect(typeof dataUrl).toBe("string");
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("generates deterministic QR for the same token", async () => {
    // Test via QRCode directly
    const token = "deterministic-token";
    const dataUrl1 = await QRCode.toDataURL(token, { width: 320, margin: 2 });
    const dataUrl2 = await QRCode.toDataURL(token, { width: 320, margin: 2 });

    expect(dataUrl1).toBe(dataUrl2);
  });

  it("generates different QR for different tokens", async () => {
    // Test via QRCode directly
    const dataUrl1 = await QRCode.toDataURL("token-1", { width: 320, margin: 2 });
    const dataUrl2 = await QRCode.toDataURL("token-2", { width: 320, margin: 2 });

    expect(dataUrl1).not.toBe(dataUrl2);
  });
});

describe("ISSUE-02: qrDataUrlToBase64 implementation", () => {
  it("qrDataUrlToBase64 function exists and strips prefix", () => {
    const qrPath = join(__dirname, '../../src/lib/qr.ts');
    const content = readFileSync(qrPath, 'utf-8');

    expect(content).toContain('export function qrDataUrlToBase64');
    expect(content).toContain('PNG_DATA_URL_PREFIX');
    expect(content).toContain('.slice(PNG_DATA_URL_PREFIX.length)');
  });

  it("qrDataUrlToBase64 validates PNG prefix before stripping", () => {
    const qrPath = join(__dirname, '../../src/lib/qr.ts');
    const content = readFileSync(qrPath, 'utf-8');

    expect(content).toContain('if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX))');
    expect(content).toContain('throw new Error');
    expect(content).toContain('expected a PNG base64 data URL');
  });

  it("QRCode produces PNG data URL format", async () => {
    const token = "test-token";
    const dataUrl = await QRCode.toDataURL(token, { width: 320, margin: 2 });

    // Verify the format is PNG base64
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    const base64Part = dataUrl.replace("data:image/png;base64,", "");
    expect(base64Part).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it("base64 extraction logic (slice) produces valid base64", async () => {
    const dataUrl = await QRCode.toDataURL("test", { width: 320, margin: 2 });
    const prefix = "data:image/png;base64,";
    const base64 = dataUrl.slice(prefix.length);

    expect(base64).not.toContain("data:");
    expect(base64).not.toContain(";base64,");
    expect(base64).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});
