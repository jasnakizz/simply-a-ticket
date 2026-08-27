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
import {
  Ban,
  CameraOff,
  CircleAlert,
  CircleCheck,
  CircleCheckBig,
  CircleX,
  LoaderCircle,
  type LucideIcon,
} from "lucide-react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";

import { checkInTicket, lookupTicket } from "@/app/actions/check-in";
import type { ScanResult } from "@/lib/scan-result";
import type { CheckInState } from "@/app/actions/types";
import { formatCheckInTimestamp, formatRelativeTime } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Phase =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "scanning" }
  | { kind: "checking" }
  | { kind: "camera-unavailable" }
  | { kind: "lookup-error" }
  | { kind: "result"; result: ScanResult; token: string };

const initialCheckIn: CheckInState = {};

// Copy held verbatim from the 03-UI-SPEC Copywriting Contract. Kept as string
// constants (not inline JSX text) so a literal apostrophe survives without
// tripping react/no-unescaped-entities, and so the exact contracted wording is
// greppable in one place.
const NOT_FOUND_BODY =
  "This code isn't a ticket for any event. Check you scanned the right code.";
const WRONG_EVENT_BODY = "This ticket is for a different event.";
const CAMERA_UNAVAILABLE_BODY =
  "Simply a Ticket can't reach a camera on this device. Check that a camera is connected and that your browser is allowed to use it, then try again.";
const LOOKUP_ERROR_BODY =
  "The ticket couldn't be checked. Check your connection and try again.";

// Per-field validation message on the pay-at-door form — same treatment as the
// order form's FieldError: role="alert", a CircleAlert glyph, near-black. Red
// stays reserved for the STOP-family result states and a server failure.
function FieldError({ message }: { message: string }) {
  return (
    <p role="alert" className="flex items-center gap-1 text-sm text-foreground">
      <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
      {message}
    </p>
  );
}

// Format a stored decimal string to exactly two places for the balance line
// and the amount-field prefill — WITHOUT routing it through a JavaScript
// number. 03-02 observed the driver hands a Postgres `numeric` back as a JS
// number, so classifyScan's String() can yield "2000" for a row that reads
// "2000.00", and a balance shown as "2000" to someone counting cash is a
// different-looking figure. Pure string work: anything that is not a plain
// non-negative decimal is returned untouched.
function toTwoDecimals(raw: string): string {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(raw.trim());
  if (!match) return raw;
  const fraction = (match[2] ?? "").padEnd(2, "0");
  return `${match[1]}.${fraction}`;
}

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
        {/* Live-camera framing guide (D-12): a centred square over a darkened
            surround. The single huge translucent-black box-shadow masks
            everything outside the square; the container's overflow-hidden
            clips it. Decorative only — no scanning animation is contracted
            and it changes nothing about what decodes. */}
        {phase.kind === "scanning" && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <div
              className="size-2/3 aspect-square rounded-lg border-2 border-white/90"
              style={{ boxShadow: "0 0 0 100vmax rgba(0, 0, 0, 0.35)" }}
            />
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
        <ResultShell icon={CameraOff} word="Camera unavailable" tone="stop">
          <p className="text-base break-words">{CAMERA_UNAVAILABLE_BODY}</p>
          <ActionGroup>
            <Button onClick={startScan} className="min-h-11 w-full">
              Try again
            </Button>
          </ActionGroup>
        </ResultShell>
      )}

      {phase.kind === "lookup-error" && (
        // Not one of the five designed result states: a non-throwing lookup
        // failure has no bespoke screen this phase (an explicit no-connection
        // state is Phase 4 / SCAN-05). This is a minimal honest terminal
        // state instead of a silent hang on "Checking ticket…".
        <ResultShell icon={CircleAlert} word="Something went wrong" tone="stop">
          <p className="text-base break-words">{LOOKUP_ERROR_BODY}</p>
          <ActionGroup>
            <ScanNextButton onClick={startScan} />
          </ActionGroup>
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

// The full-screen result stack from the 03-UI-SPEC Layout & Interaction
// Contract: a 64px glyph, the status word at the Display scale, then the
// caller's detail block and actions. `tone` is the one learnable binary for a
// door operator — GO (near-black foreground) means proceed, STOP (destructive
// red) means halt. Colour is never the only signal: every state also carries
// its own glyph and its own status word.
function ResultShell({
  icon: Icon,
  word,
  tone,
  children,
}: {
  icon: LucideIcon;
  word: string;
  tone: "go" | "stop";
  children: ReactNode;
}) {
  const toneClass = tone === "stop" ? "text-destructive" : "text-foreground";
  return (
    <div className="flex w-full flex-col items-center text-center">
      {/* glyph → status word: sm (8px) */}
      <Icon aria-hidden="true" className={`size-16 ${toneClass}`} />
      <p className={`mt-2 text-[2rem] font-semibold leading-[1.2] ${toneClass}`}>
        {word}
      </p>
      {/* status word → detail: md (16px); detail → actions: lg (24px) */}
      <div className="mt-4 flex w-full flex-col items-center gap-6">
        {children}
      </div>
    </div>
  );
}

// The action column at the foot of every result state: full-width, ≥44px
// controls stacked with an sm (8px) gap (primary action → "Scan next").
function ActionGroup({ children }: { children: ReactNode }) {
  return <div className="flex w-full flex-col gap-2">{children}</div>;
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
  // Heading scale (24px/600) per the Typography usage map, wrapping rather
  // than clipping a long name (break-words, reused from the confirmation page).
  return (
    <p className="text-2xl font-semibold leading-[1.2] break-words">{name}</p>
  );
}

// Shared by both already-checked-in paths — a lookup that finds a checked_in
// ticket, and a check-in attempt whose atomic UPDATE matched zero rows. Both
// show how long ago (relative, glanceable) above the exact moment (absolute,
// muted) so a seconds-old double scan looks nothing like a re-entry hours
// later (D-09).
function AlreadyCheckedIn({
  name,
  checkedInAt,
  onScanNext,
}: {
  name: string;
  checkedInAt: string;
  onScanNext: () => void;
}) {
  const hasTimestamp =
    checkedInAt !== "" && !Number.isNaN(new Date(checkedInAt).getTime());
  return (
    <ResultShell icon={CircleAlert} word="Already checked in" tone="stop">
      <div className="flex w-full flex-col items-center gap-1">
        <AttendeeName name={name} />
        {hasTimestamp ? (
          <>
            <p className="text-base">
              Checked in {formatRelativeTime(checkedInAt)}
            </p>
            <p className="text-sm text-muted-foreground">
              {formatCheckInTimestamp(checkedInAt)}
            </p>
          </>
        ) : (
          <p className="text-base">Checked in earlier</p>
        )}
      </div>
      <ActionGroup>
        <ScanNextButton onClick={onScanNext} />
      </ActionGroup>
    </ResultShell>
  );
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
  // Gates the pay-at-door reveal and the "Mark as paid & check in" button.
  // Local state — this component is keyed by the scan id, so a fresh scan
  // starts with the box unticked.
  const [paymentCollected, setPaymentCollected] = useState(false);

  if (checkInState.ok) {
    // Distinct glyph (CircleCheckBig) from the pre-check-in "Valid ticket"
    // CircleCheck so a completed check-in is never mistaken for a fresh scan.
    return (
      <ResultShell icon={CircleCheckBig} word="Checked in" tone="go">
        <div className="flex w-full flex-col items-center gap-1">
          <AttendeeName name={checkInState.attendeeName ?? ""} />
          <p className="text-base">Checked in just now</p>
        </div>
        <ActionGroup>
          <ScanNextButton onClick={onScanNext} />
        </ActionGroup>
      </ResultShell>
    );
  }

  if (checkInState.alreadyCheckedIn) {
    return (
      <AlreadyCheckedIn
        name={checkInState.attendeeName ?? ""}
        checkedInAt={checkInState.checkedInAt ?? ""}
        onScanNext={onScanNext}
      />
    );
  }

  if (checkInState.notFound || result.kind === "not_found") {
    return (
      <ResultShell icon={CircleX} word="Ticket not found" tone="stop">
        <p className="text-base break-words">{NOT_FOUND_BODY}</p>
        <ActionGroup>
          <ScanNextButton onClick={onScanNext} />
        </ActionGroup>
      </ResultShell>
    );
  }

  if (result.kind === "wrong_event") {
    // Generic sentence only — the other event is never named and never
    // queried for (D-11), so a ticket scanned at the wrong door leaks nothing.
    return (
      <ResultShell icon={Ban} word="Wrong event" tone="stop">
        <p className="text-base break-words">{WRONG_EVENT_BODY}</p>
        <ActionGroup>
          <ScanNextButton onClick={onScanNext} />
        </ActionGroup>
      </ResultShell>
    );
  }

  if (result.kind === "already_checked_in") {
    return (
      <AlreadyCheckedIn
        name={result.attendeeName}
        checkedInAt={result.checkedInAt}
        onScanNext={onScanNext}
      />
    );
  }

  // valid_balance_due — the pay-at-door sub-flow (D-15 / D-16 / D-18): an
  // emphasised balance line, a "Payment collected" checkbox that gates
  // everything below it, then the revealed prefilled-but-editable amount and
  // currency, then "Mark as paid & check in". The superRefine in check-in.ts
  // is the real gate; the disabled button is only convenience.
  if (result.kind === "valid_balance_due") {
    const balanceDisplay = toTwoDecimals(result.balanceAmount);
    const amountDefault =
      checkInState.values?.collected_amount || balanceDisplay;
    const currencyDefault =
      checkInState.values?.collected_currency || result.balanceCurrency;

    return (
      <ResultShell icon={CircleCheck} word="Valid ticket" tone="go">
        <div className="flex w-full flex-col items-center gap-2">
          <AttendeeName name={result.attendeeName} />
          {result.ticketTypeName && (
            <dl className="flex flex-col items-center gap-1">
              <dt className="text-sm font-semibold leading-[1.4]">
                Ticket type
              </dt>
              <dd className="text-base break-words">{result.ticketTypeName}</dd>
            </dl>
          )}
          {/* Body size, 600 weight, md (16px) clear above and below — an
              in-scale emphasis so it reads as a call to collect money (D-15),
              not another detail row. The amount is formatted to two places
              without a numeric round-trip (see toTwoDecimals). */}
          <p className="my-2 text-base font-semibold leading-[1.5] break-words">
            Balance due: {balanceDisplay} {result.balanceCurrency}
          </p>
          {checkInState.formError && (
            <p role="alert" className="text-base text-destructive break-words">
              {checkInState.formError}
            </p>
          )}
        </div>
        <ActionGroup>
          <form action={checkInAction} className="flex w-full flex-col gap-4">
            <input type="hidden" name="token" defaultValue={token} />
            <input type="hidden" name="event_id" defaultValue={eventId} />
            {/* The path marker checkInSchema's superRefine switches on. */}
            <input type="hidden" name="balance_due" defaultValue="true" />

            {/* Whole row is a ≥44px tap target — this runs on a phone held in
                one hand at a door. Unticked by default. */}
            <label className="flex min-h-11 w-full items-center gap-2">
              <Checkbox
                name="payment_collected"
                checked={paymentCollected}
                onCheckedChange={(value) => setPaymentCollected(value === true)}
              />
              <span className="text-sm font-semibold leading-[1.4]">
                Payment collected
              </span>
            </label>
            {checkInState.errors?.payment_collected?.[0] && (
              <FieldError message={checkInState.errors.payment_collected[0]} />
            )}

            {paymentCollected && (
              <div className="flex w-full flex-col gap-4">
                <div className="flex w-full flex-col gap-2">
                  <Label htmlFor="collected_amount">Amount collected</Label>
                  <Input
                    id="collected_amount"
                    name="collected_amount"
                    inputMode="decimal"
                    defaultValue={amountDefault}
                  />
                  {checkInState.errors?.collected_amount?.[0] && (
                    <FieldError
                      message={checkInState.errors.collected_amount[0]}
                    />
                  )}
                </div>
                <div className="flex w-full flex-col gap-2">
                  <Label htmlFor="collected_currency">Currency</Label>
                  {/* key tied to the echoed value so a rejected submit
                      re-applies the staff member's choice rather than
                      snapping back — same remount trick as the order form. */}
                  <Select
                    key={currencyDefault}
                    name="collected_currency"
                    defaultValue={currencyDefault}
                  >
                    <SelectTrigger id="collected_currency" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="RSD">RSD</SelectItem>
                    </SelectContent>
                  </Select>
                  {checkInState.errors?.collected_currency?.[0] && (
                    <FieldError
                      message={checkInState.errors.collected_currency[0]}
                    />
                  )}
                </div>
              </div>
            )}

            <Button
              type="submit"
              disabled={!paymentCollected || checkInPending}
              className="min-h-11 w-full"
            >
              {checkInPending ? "Checking in…" : "Mark as paid & check in"}
            </Button>
          </form>
          <ScanNextButton onClick={onScanNext} />
        </ActionGroup>
      </ResultShell>
    );
  }

  // valid (plain) — no balance, a single "Check in" button, no checkbox and
  // no revealed fields (D-18).
  return (
    <ResultShell icon={CircleCheck} word="Valid ticket" tone="go">
      <div className="flex w-full flex-col items-center gap-2">
        <AttendeeName name={result.attendeeName} />
        {result.ticketTypeName && (
          <dl className="flex flex-col items-center gap-1">
            <dt className="text-sm font-semibold leading-[1.4]">Ticket type</dt>
            <dd className="text-base break-words">{result.ticketTypeName}</dd>
          </dl>
        )}
        {checkInState.formError && (
          <p role="alert" className="text-base text-destructive break-words">
            {checkInState.formError}
          </p>
        )}
      </div>
      <ActionGroup>
        <form action={checkInAction} className="flex w-full flex-col">
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
        <ScanNextButton onClick={onScanNext} />
      </ActionGroup>
    </ResultShell>
  );
}
