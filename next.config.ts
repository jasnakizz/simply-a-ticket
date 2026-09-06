import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tell Next to `require("pdfkit")` natively from the traced node_modules at
  // runtime instead of bundling it through Turbopack. pdfkit reads its own
  // internal font-metrics files off disk with a relative path; when it is
  // bundled that path no longer exists inside the Vercel serverless function
  // and the roster route 500s with ENOENT. Listing it here keeps pdfkit and
  // its file reads resolving against the real package on disk.
  // (If a preview build error ever names "fontkit", add "fontkit" to this
  // array too — see 25-RESEARCH.md assumption A3.)
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
