import type { Metadata } from "next";
import { Archivo, Geist_Mono } from "next/font/google";
import "./globals.css";

// Archivo is a variable font — no `weight` array, no `axes`; the wght axis
// (100–900) is included by default and the design uses weight only.
const archivo = Archivo({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-archivo",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Simply a Ticket",
  description: "Staff tool for creating events, ticket types, and orders.",
  // This app has no authentication anywhere in v1 — an unlisted URL is the
  // entire access-control model. Telling crawlers not to index/follow is
  // half of that (the other half is src/app/robots.ts) — without it, a
  // crawled and indexed staff route would void the only access control
  // this app has.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
