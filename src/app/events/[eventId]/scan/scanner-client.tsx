"use client";

// The first component in the app to touch a browser device API. @zxing/browser
// needs getUserMedia and a real DOM, neither of which exists during server
// rendering — that is what forces the "use client" directive here, not
// interactivity for its own sake. The actual ticket lookup and the check-in
// write both happen server-side in check-in.ts; this file drives the camera
// and holds the result state machine.
import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { LoaderCircle } from "lucide-react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";

import { checkInTicket, lookupTicket } from "@/app/actions/check-in";
import type { ScanResult } from "@/lib/scan-result";
import type { CheckInState } from "@/app/actions/types";
import { Button } from "@/components/ui/button";

type Phase =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "scanning" }
  | { kind: "checking" }
  | { kind: "camera-unavailable" }
  | { kind: "lookup-error" }
  | { kind: "result"; result: ScanResult; token: string };

const initialCheckIn: CheckInState = {};

export function ScannerClient({ eventId }: { eventId: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  // Bumped on every scan attempt so the CheckInPanel below remounts (and its
  // useActionState resets) for each fresh ticket — no effect syncing needed.
  const [scanId, setScanId] = useState(0);
  const controlsRef = useRef<IScannerControls | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Stop the camera on unmount — backing out of the page must not leave the
  // camera light on (RESEARCH Pitfall 10).
  useEffect(() => {
    return () => {
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, []);

  const startScan = useCallback(async () => {
    // Guard against React's development double-invocation opening two camera
    // streams (RESEARCH Pitfall 9).
    if (controlsRef.current) return;

    setScanId((n) => n + 1);
    setPhase({ kind: "starting" });

    // Null any previous stream before restarting — part of the iOS Safari
    // teardown-and-recreate loop (D-04).
    if (videoRef.current) videoRef.current.srcObject = null;

    // A BRAND-NEW reader every time. Never cached, never resumed: reusing a
    // reader is the documented cause of iOS Safari hanging on the second
    // scan, and there is no reader.reset() in 0.2.x.
    const reader = new BrowserQRCodeReader(undefined, {
      delayBetweenScanAttempts: 100,
    });

    async function resolveScan(token: string) {
      try {
        const res = await lookupTicket(token, eventId);
        if (res.kind === "error") {
          setPhase({ kind: "lookup-error" });
          return;
        }
        setPhase({ kind: "result", result: res, token });
      } catch {
        setPhase({ kind: "lookup-error" });
      }
    }

    try {
      const controls = await reader.decodeFromConstraints(
        // `ideal`, never `exact`: a hard constraint rejects outright on any
        // device with no rear camera, including the dev laptop.
        { video: { facingMode: { ideal: "environment" } } },
        videoRef.current ?? undefined,
        (result, _error, scanControls) => {
          // Ignore the error argument entirely — the library raises a
          // not-found exception on essentially every empty frame (~10x/sec).
          // Act only when a result is actually decoded.
          if (!result) return;
          scanControls.stop();
          controlsRef.current = null;
          setPhase({ kind: "checking" });
          void resolveScan(result.getText());
        },
      );
      controlsRef.current = controls;
      setPhase({ kind: "scanning" });
    } catch {
      // The decodeFromConstraints promise rejecting is the ONLY real camera
      // failure signal — denied permission, no device, device already in
      // use, or an over-constrained request all arrive here.
      controlsRef.current = null;
      setPhase({ kind: "camera-unavailable" });
    }
  }, [eventId]);

  const cameraActive = phase.kind === "starting" || phase.kind === "scanning";

  return (
    <div className="flex flex-col flex-1 items-center justify-center gap-4">
      {/* The video element stays mounted so its ref is available the moment
          startScan runs; it is only visible while the camera is active. */}
      <div
        className={
          cameraActive
            ? "relative w-full max-w-md aspect-square overflow-hidden rounded-lg bg-muted"
            : "hidden"
        }
      >
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          autoPlay
          muted
          playsInline
        />
        {phase.kind === "starting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <LoaderCircle aria-hidden="true" className="size-8 animate-spin" />
            <p className="text-base">Starting camera…</p>
          </div>
        )}
      </div>

      {phase.kind === "scanning" && (
        <p className="text-base text-muted-foreground text-center">
          Point at the attendee&apos;s QR code
        </p>
      )}

      {phase.kind === "idle" && (
        <div className="flex w-full flex-col items-center gap-4">
          <p className="text-base text-muted-foreground text-center">
            Point the camera at an attendee&apos;s ticket QR code to check them
            in.
          </p>
          <Button onClick={startScan} className="min-h-11 w-full">
            Start scanning
          </Button>
        </div>
      )}

      {phase.kind === "checking" && (
        <div className="flex flex-col items-center gap-2">
          <LoaderCircle aria-hidden="true" className="size-16 animate-spin" />
          <p className="text-base">Checking ticket…</p>
        </div>
      )}

      {phase.kind === "camera-unavailable" && (
        <ResultShell word="Camera unavailable">
          <p className="text-base break-words">
            Simply a Ticket can&apos;t reach a camera on this device. Check that
            a camera is connected and that your browser is allowed to use it,
            then try again.
          </p>
          <Button onClick={startScan} className="min-h-11 w-full">
            Try again
          </Button>
        </ResultShell>
      )}

      {phase.kind === "lookup-error" && (
        <ResultShell word="Something went wrong">
          <p className="text-base break-words">
            The ticket couldn&apos;t be checked. Check your connection and try
            again.
          </p>
          <ScanNextButton onClick={startScan} />
        </ResultShell>
      )}

      {phase.kind === "result" && (
        <ScanResultView
          key={scanId}
          result={phase.result}
          token={phase.token}
          eventId={eventId}
          onScanNext={startScan}
        />
      )}
    </div>
  );
}

function ResultShell({ word, children }: { word: string; children: ReactNode }) {
  return (
    <div className="flex w-full flex-col items-center gap-4 text-center">
      <p className="text-[2rem] font-semibold leading-[1.2]">{word}</p>
      {children}
    </div>
  );
}

function ScanNextButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" onClick={onClick} className="min-h-11 w-full">
      Scan next
    </Button>
  );
}

function AttendeeName({ name }: { name: string }) {
  if (!name) return null;
  return (
    <p className="text-xl font-semibold leading-[1.2] break-words">{name}</p>
  );
}

function formatAbsolute(iso: string): string {
  if (!iso) return "earlier";
  return new Date(iso).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function ScanResultView({
  result,
  token,
  eventId,
  onScanNext,
}: {
  result: ScanResult;
  token: string;
  eventId: string;
  onScanNext: () => void;
}) {
  // The check-in state lives here, not in the parent: this component is
  // keyed by the scan id, so a fresh scan remounts it and resets
  // useActionState — the "just checked in" screen never bleeds into the next
  // ticket, and no effect is needed to sync it.
  const [checkInState, checkInAction, checkInPending] = useActionState(
    checkInTicket,
    initialCheckIn,
  );

  if (checkInState.ok) {
    return (
      <ResultShell word="Checked in">
        <AttendeeName name={checkInState.attendeeName ?? ""} />
        <p className="text-base">Checked in just now</p>
        <ScanNextButton onClick={onScanNext} />
      </ResultShell>
    );
  }

  if (checkInState.alreadyCheckedIn) {
    return (
      <ResultShell word="Already checked in">
        <AttendeeName name={checkInState.attendeeName ?? ""} />
        <p className="text-base">
          Checked in {formatAbsolute(checkInState.checkedInAt ?? "")}
        </p>
        <ScanNextButton onClick={onScanNext} />
      </ResultShell>
    );
  }

  if (checkInState.notFound || result.kind === "not_found") {
    return (
      <ResultShell word="Ticket not found">
        <p className="text-base break-words">
          This code isn&apos;t a ticket for any event. Check you scanned the
          right code.
        </p>
        <ScanNextButton onClick={onScanNext} />
      </ResultShell>
    );
  }

  if (result.kind === "wrong_event") {
    return (
      <ResultShell word="Wrong event">
        <p className="text-base break-words">
          This ticket is for a different event.
        </p>
        <ScanNextButton onClick={onScanNext} />
      </ResultShell>
    );
  }

  if (result.kind === "already_checked_in") {
    return (
      <ResultShell word="Already checked in">
        <AttendeeName name={result.attendeeName} />
        <p className="text-base">
          Checked in {formatAbsolute(result.checkedInAt)}
        </p>
        <ScanNextButton onClick={onScanNext} />
      </ResultShell>
    );
  }

  // valid | valid_balance_due — same header block. The pay-at-door check-in
  // sub-flow (the "Payment collected" gate and "Mark as paid & check in") is
  // plan 03-04; this tracer wires the plain "Check in" path only, so a
  // balance-due ticket shows the balance and "Scan next" but no primary
  // action yet.
  const isBalanceDue = result.kind === "valid_balance_due";

  return (
    <ResultShell word="Valid ticket">
      <AttendeeName name={result.attendeeName} />
      {result.ticketTypeName && (
        <dl className="flex flex-col items-center gap-1">
          <dt className="text-sm font-semibold leading-[1.4]">Ticket type</dt>
          <dd className="text-base break-words">{result.ticketTypeName}</dd>
        </dl>
      )}
      {isBalanceDue && (
        <p className="text-base font-semibold leading-[1.5]">
          Balance due: {result.balanceAmount} {result.balanceCurrency}
        </p>
      )}
      {checkInState.formError && (
        <p role="alert" className="text-base text-destructive break-words">
          {checkInState.formError}
        </p>
      )}
      {!isBalanceDue && (
        <form action={checkInAction} className="flex w-full flex-col gap-2">
          <input type="hidden" name="token" defaultValue={token} />
          <input type="hidden" name="event_id" defaultValue={eventId} />
          <Button
            type="submit"
            disabled={checkInPending}
            className="min-h-11 w-full"
          >
            {checkInPending ? "Checking in…" : "Check in"}
          </Button>
        </form>
      )}
      <ScanNextButton onClick={onScanNext} />
    </ResultShell>
  );
}
