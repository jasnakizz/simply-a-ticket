"use client";

// In the App Router, `global-error.tsx` is the boundary that catches an error
// thrown by the ROOT layout itself (src/app/layout.tsx). Because the root
// layout has failed, the framework cannot wrap this component in it — this
// file REPLACES the layout. That is why it has to render its own document
// root and body element, import the stylesheet itself, and re-declare the
// fonts: none of the root layout's style context reaches here. And, like
// every error boundary, it must be a Client Component, because the framework
// hands it a recovery function and only client code can hold an onClick
// handler.
import "./globals.css";
import { Archivo, Geist_Mono } from "next/font/google";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

// Re-instantiated verbatim from src/app/layout.tsx — same variable names, same
// options. Archivo is a variable font: no `weight`, no `axes`. Putting both
// `.variable` classes on the document root is what makes the base-layer
// font-family rule resolve to Archivo in this self-rendered document (D-01).
const archivo = Archivo({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-archivo",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  // Same stable Next 16.3 recovery prop as src/app/events/error.tsx (D-05,
  // plan 09-01) — the two error boundaries must not diverge.
  retry: () => void;
}) {
  useEffect(() => {
    // Server log and browser console only — never placed in the DOM. Only the
    // opaque digest below is ever shown. Kept out of the render body so it
    // does not double-fire under strict / concurrent rendering.
    console.error(error);
  }, [error]);

  return (
    <html
      lang="en"
      className={`${archivo.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* The inline style is the phase's single sanctioned raw-hex exception:
          the ground and ink token values, copied verbatim from the token
          layer. It exists because this is the one screen that can plausibly
          render while its own stylesheet chunk is unavailable — without the
          fallback it would show an unstyled or OS-themed document at the exact
          moment the operator most needs a legible message. */}
      <body
        className="min-h-full flex flex-col bg-background text-foreground font-sans"
        style={{ backgroundColor: "#f3f2f2", color: "#201e1d" }}
      >
        <div className="flex flex-col flex-1 items-center justify-center">
          <div className="w-full max-w-[560px] px-4 py-6 flex flex-col items-start gap-4 text-left">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              SOMETHING WENT WRONG
            </p>
            <h1 className="text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em]">
              The app hit an unexpected error
            </h1>
            <p className="text-[15px] leading-[1.55] text-muted-foreground">
              Reloading usually fixes it. If it keeps happening, go back to the start.
            </p>
            <div className="flex w-full flex-col gap-2 pt-2">
              <Button
                onClick={() => retry()}
                className="min-h-[52px] w-full justify-start text-left"
              >
                Reload
              </Button>
              {/* A plain anchor, not the router-aware link component: the root
                  layout has thrown, so the client router may be in a bad
                  state and a full document navigation is the reliable path.
                  Authored on the corrected accent ramp step (D-02) — no
                  WR-01 pass needed. The framework lint rule that pushes every
                  in-app navigation through the router link component is
                  deliberately suppressed here for that reason. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/events"
                className="min-h-[52px] inline-flex items-center text-[14px] font-semibold text-[var(--color-accent-700)] underline underline-offset-4"
              >
                Go to events
              </a>
            </div>
            {error.digest && (
              <p className="text-[13px] text-muted-foreground">
                Reference: <span className="break-all">{error.digest}</span>
              </p>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
