import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
