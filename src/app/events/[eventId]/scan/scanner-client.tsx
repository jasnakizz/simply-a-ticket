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
  Keyboard,
  LoaderCircle,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";

import { checkInTicket, lookupTicket } from "@/app/actions/check-in";
import type { ScanResult } from "@/lib/scan-result";
import type { CheckInState } from "@/app/actions/types";
import { formatCheckInTimestamp, formatRelativeTime } from "@/lib/date";
import { withTimeout } from "@/lib/with-timeout";
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
  | { kind: "manual" }
  | { kind: "no-connection"; token: string }
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

// SCAN-03 manual-entry copy, verbatim from the 04-UI-SPEC Copywriting
// Contract. Module-level (not inline JSX text) for the same reasons as the
// constants above: a literal apostrophe survives react/no-unescaped-entities
// and the contracted wording is greppable in one place.
const MANUAL_LINK_LABEL = "Enter code manually";
const MANUAL_FIELD_LABEL = "Ticket code";
const MANUAL_FIELD_PLACEHOLDER = "Paste or type the ticket code";
const MANUAL_SUBMIT_LABEL = "Check ticket";
const MANUAL_HELPER = "Camera can't read the code? Enter it by hand.";

// D-05: the client-side wait bound that turns a silent hang on "Checking
// ticket…" into a visible "No connection" state. This is the single value to
// tune if on-device UAT shows false positives on a slow-but-live link.
const TIMEOUT_MS = 10_000;

// D-08: the failed-check-in message. A VERBATIM copy of the string
// checkInTicket already returns for a caught database error
// (src/app/actions/check-in.ts:226 and :252) — this introduces no new
// user-visible copy. If a future edit changes one and not the other, the
// Task 3 cross-file assertion in scanner-client.source.test.ts fails.
const CHECKIN_NETWORK_ERROR =
  "Something went wrong checking this ticket in. Check your connection and try again.";

// Per-field validation message on the pay-at-door form — same treatment as the
// order form's FieldError: role="alert", a CircleAlert glyph, near-black. Red
// stays reserved for the STOP-family result states and a server failure.
function FieldError({ message }: { message: string }) {
  return (
    <p role="alert" className="flex items-center gap-1 text-[13px] text-foreground">
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

// D-08: the reducer actually passed to useActionState — a CLIENT wrapper
// around the checkInTicket Server Action, never the raw action. A rejected or
// hung check-in POST raised inside the useActionState transition bubbles to
// the nearest error boundary (src/app/events/error.tsx) and collapses the
// subtree, taking the scanned ticket with it (04-RESEARCH Pitfall 2). A
// .catch() on the OUTSIDE of the dispatch cannot stop that. Catching HERE,
// inside the reducer, and returning a CheckInState value is the only fix.
//
// - The same TIMEOUT_MS wait bound as the lookup applies (D-05: one wait
//   bound for both calls, not two that can drift apart) so a hung check-in
//   does not sit forever on "Checking in…".
// - Every normal checkInTicket return (ok / alreadyCheckedIn / notFound /
//   the zod-rejection { errors, values } / its own caught-DB { formError })
//   passes straight through. Only a throw, a rejection, or a timeout is
//   converted into a returned value.
// - The caught value is NEVER read: no message, no code, no stack, no
//   database payload reaches rendered state — only the fixed contracted
//   constant (Security V7 / SCAN-05 privacy prohibition). Never re-throws.
// - The values echo shape is copied from check-in.ts:159-165 so a hand-typed
//   collected amount and currency survive a network-failed balance-due
//   submit and the amount input does not snap back on retry.
async function checkInWithGuard(
  prevState: CheckInState,
  formData: FormData,
): Promise<CheckInState> {
  try {
    return await withTimeout(checkInTicket(prevState, formData), TIMEOUT_MS);
  } catch {
    return {
      formError: CHECKIN_NETWORK_ERROR,
      values: {
        collected_amount: String(formData.get("collected_amount") ?? ""),
        collected_currency: String(formData.get("collected_currency") ?? ""),
      },
    };
  }
}

export function ScannerClient({ eventId }: { eventId: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  // Bumped on every scan attempt so the CheckInPanel below remounts (and its
  // useActionState resets) for each fresh ticket — no effect syncing needed.
  const [scanId, setScanId] = useState(0);
  const controlsRef = useRef<IScannerControls | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // WR-02: a synchronous in-flight guard for startScan. Set true before the
  // first await, cleared in that function's finally — see the comment there.
  const startingRef = useRef(false);
  // CR-02: records that the component tore down while a camera open was still
  // in flight. `controlsRef` cannot express this — it is null for the entire
  // `decodeFromConstraints` window (assigned only after that await resolves),
  // which is exactly what defeats the unmount cleanup. This ref is the
  // post-await signal that the stream which just arrived belongs to a dead
  // component and must be released here rather than parked on a ref that
  // nothing will ever read again.
  const cancelledRef = useRef(false);

  // Stop the camera on unmount — backing out of the page must not leave the
  // camera light on (RESEARCH Pitfall 10).
  useEffect(() => {
    // CR-02 / Strict Mode: re-arm on every mount. Strict Mode is on by default
    // for the App Router (Next >= 13.5.1) and next.config.ts does not disable
    // it, so in `next dev` React mounts, runs the cleanup, then remounts.
    // Without this re-arm that dev-only cleanup would latch `cancelledRef`
    // true forever and every later `startScan` would stop the camera the
    // instant it opened — the scanner would look completely broken locally
    // while working in production. Not defensive padding; it is load-bearing.
    cancelledRef.current = false;
    return () => {
      // CR-02: mark teardown BEFORE stopping, so a camera open still in flight
      // can observe it after its await resolves and release its own stream.
      cancelledRef.current = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, []);

  // Every entry path funnels through here: the camera decode below, the
  // "Try again" button on the no-connection state, and (in a later plan) the
  // manual-entry submit. One lookupTicket call site, one scanId bump, one
  // generic failure path.
  const resolveScan = useCallback(
    async (token: string) => {
      setScanId((n) => n + 1);
      setPhase({ kind: "checking" });
      try {
        const res = await withTimeout(lookupTicket(token, eventId), TIMEOUT_MS);
        if (res.kind === "error") {
          // A returned { kind: "error" } and any throw in the catch below are
          // the SAME generic failure (D-05). Never branch on the reason and
          // never read the caught value — a raw error must not reach the
          // screen. The token rides the Phase so "Try again" re-runs the
          // identical call (D-07).
          setPhase({ kind: "no-connection", token });
          return;
        }
        setPhase({ kind: "result", result: res, token });
      } catch {
        // withTimeout's TimeoutError (a hung request) or a rejected POST
        // (offline) — one path, token retained.
        setPhase({ kind: "no-connection", token });
      }
    },
    [eventId],
  );

  const startScan = useCallback(async () => {
    // WR-02: refuse a second entry while the camera is still opening. The
    // real hazard is the async window between this call and
    // `await reader.decodeFromConstraints(...)` resolving: `controlsRef.current`
    // is assigned only AFTER that await, so a fast double-tap on "Start
    // scanning" / "Try again" would pass a `controlsRef.current`-only guard
    // and open a second getUserMedia stream with no controls object to stop
    // it — leaving the camera light on (03-REVIEW WR-02, closes AR-03-01).
    // `startScan` is an onClick handler, so React Strict Mode does NOT
    // double-invoke it; this guard exists purely for the human double-tap.
    // `startingRef` is set synchronously below, before any await, and cleared
    // in `finally` on both the success and the camera-failure exit.
    if (controlsRef.current || startingRef.current) return;
    startingRef.current = true;

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

    // WR-03: one-shot flag. ZXing fires the decode callback ~10x/second and
    // `scanControls.stop()` does not guarantee that an already-queued frame
    // will not still deliver a second `result`. Without this, resolveScan and
    // setPhase could run twice for one scan — bumping scanId twice and
    // swapping the rendered result state out from under the operator.
    let handled = false;

    try {
      const controls = await reader.decodeFromConstraints(
        // `ideal`, never `exact`: a hard constraint rejects outright on any
        // device with no rear camera, including the dev laptop.
        { video: { facingMode: { ideal: "environment" } } },
        videoRef.current ?? undefined,
        (result, _error, scanControls) => {
          // Ignore the error argument entirely — the library raises a
          // not-found exception on essentially every empty frame (~10x/sec).
          // Act only on the FIRST actually-decoded result (WR-03).
          if (handled || !result) return;
          handled = true;
          scanControls.stop();
          controlsRef.current = null;
          // resolveScan sets { kind: "checking" } itself now.
          void resolveScan(result.getText());
        },
      );
      // Two guards sit between the await and the ref/phase assignment,
      // cancellation FIRST — the order is deliberate (see below).
      //
      // CR-02 teardown guard: the component unmounted while the camera was
      // still opening. `controlsRef.current` was null for that whole window so
      // the unmount cleanup stopped nothing; the stream we just acquired must
      // be released here or nothing ever will. Per BrowserCodeReader, a
      // controls stop() reaches finalizeCallback -> disposeMediaStream, which
      // is what actually turns the camera light off, and it is safe to call
      // even if the decode callback already stopped it (stopScan is idempotent).
      // Never assign `controlsRef.current` on this path — a dead ref on a dead
      // component is precisely the CR-02 leak.
      if (cancelledRef.current) {
        controls.stop();
        return;
      }
      // CR-01 one-shot guard: the synchronous first zxing decode already fired
      // (zxing runs its first decode attempt synchronously inside
      // decodeFromStream, before this await resolves). It has already stopped
      // the scan, already nulled `controlsRef.current`, and already started
      // `resolveScan` (phase -> "checking"). Leaving `controlsRef.current` null
      // is the CORRECT end state — it is what lets the next `startScan` past
      // its `if (controlsRef.current || startingRef.current) return;` entry
      // guard. Falling through here would re-point the ref at stopped controls
      // and flip the phase back to "scanning" over a result the operator is
      // already looking at.
      //
      // Cancellation is checked first so a teardown ALWAYS reaches a stop(),
      // even when both flags are set, rather than exiting via this `handled`
      // bail and relying on the callback having stopped things.
      if (handled) return;
      controlsRef.current = controls;
      setPhase({ kind: "scanning" });
    } catch {
      // The decodeFromConstraints promise rejecting is the ONLY real camera
      // failure signal — denied permission, no device, device already in
      // use, or an over-constrained request all arrive here.
      controlsRef.current = null;
      setPhase({ kind: "camera-unavailable" });
    } finally {
      // Cleared on both exits so the next legitimate "Start scanning" /
      // "Try again" / "Scan next" is not locked out (WR-02).
      startingRef.current = false;
    }
  }, [resolveScan]);

  const cameraActive = phase.kind === "starting" || phase.kind === "scanning";

  return (
    <div className="flex flex-col flex-1 items-center justify-center gap-4 bg-background text-foreground">
      {/* The video element stays mounted so its ref is available the moment
          startScan runs; it is only visible while the camera is active. */}
      <div
        className={
          cameraActive
            ? "relative w-full max-w-[560px] aspect-square overflow-hidden bg-muted"
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
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-background">
            <LoaderCircle aria-hidden="true" className="size-8 animate-spin" />
            <p className="text-[15px] leading-[1.55]">Starting camera…</p>
          </div>
        )}
        {/* D-09 / D-11: the inset framing guide sits over a darkened spotlight
            surround that helps a door operator aim; the swept accent line is
            decorative, motion-guarded, and changes nothing about what decodes. */}
        {phase.kind === "scanning" && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-[12%] inset-x-[10%] border-2 border-background/25 overflow-hidden"
            style={{ boxShadow: "0 0 0 100vmax rgba(0, 0, 0, 0.35)" }}
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-[8%] h-[2px] bg-primary animate-[scanline_2.2s_ease-in-out_infinite_alternate] motion-reduce:animate-none"
            />
          </div>
        )}
      </div>

      {phase.kind === "scanning" && (
        <p className="text-[13px] text-background/70 text-center">
          Point at the attendee&apos;s QR code
        </p>
      )}

      {(phase.kind === "idle" || phase.kind === "manual") && (
        <div className="flex w-full flex-col items-center gap-4">
          <p className="text-[15px] text-background/70 text-center">
            Point the camera at an attendee&apos;s ticket QR code to check them
            in.
          </p>
          <div className="flex w-full flex-col items-center gap-2">
            <Button
              onClick={startScan}
              className="min-h-[52px] w-full justify-start text-left"
            >
              Start scanning
            </Button>
            {/* Low-key escape hatch: an accent-400 underlined disclosure link, kept subordinate to the primary scan button above it. */}
            <button
              type="button"
              onClick={() => setPhase({ kind: "manual" })}
              aria-expanded={phase.kind === "manual"}
              className="flex min-h-11 w-full items-center justify-start gap-1 text-[14px] text-[var(--color-accent-400)] underline underline-offset-4"
            >
              <Keyboard aria-hidden="true" className="size-4 shrink-0" />
              {MANUAL_LINK_LABEL}
            </button>
          </div>
          {phase.kind === "manual" && (
            // The only placement that autofocuses — the operator asked for the
            // field here, so move focus to the input and let them type.
            <ManualTokenField onSubmit={resolveScan} autoFocus />
          )}
        </div>
      )}

      {phase.kind === "checking" && (
        <div className="flex flex-col items-center gap-2 text-background">
          <LoaderCircle aria-hidden="true" className="size-16 animate-spin" />
          <p className="text-[15px] leading-[1.55]">Checking ticket…</p>
        </div>
      )}

      {phase.kind === "camera-unavailable" && (
        <div className="w-full [&_button]:text-inherit [&_button]:border-current/40">
        <ResultShell icon={CameraOff} word="Camera unavailable" tone="stop">
          <p className="text-[15px] leading-[1.55] break-words">{CAMERA_UNAVAILABLE_BODY}</p>
          <ActionGroup>
            <Button onClick={startScan} className="min-h-[52px] w-full justify-start text-left">
              Try again
            </Button>
          </ActionGroup>
          {/* Shown without a tap and without moving focus, so the on-screen keyboard does not cover the glyph and status word the operator is still reading. */}
          <div className="flex w-full flex-col gap-2">
            <p className="text-[15px] leading-[1.55] break-words">{MANUAL_HELPER}</p>
            <ManualTokenField onSubmit={resolveScan} />
          </div>
        </ResultShell>
        </div>
      )}

      {phase.kind === "no-connection" && (
        // A failed or timed-out lookup lands here rather than hanging; its own WifiOff glyph and status word keep this state distinct, and the body reuses the frozen LOOKUP_ERROR_BODY constant.
        <div className="w-full [&_button]:text-inherit [&_button]:border-current/40">
        <ResultShell icon={WifiOff} word="No connection" tone="stop">
          <p className="text-[15px] leading-[1.55] break-words">{LOOKUP_ERROR_BODY}</p>
          <ActionGroup>
            <Button
              onClick={() => resolveScan(phase.token)}
              className="min-h-[52px] w-full justify-start text-left"
            >
              Try again
            </Button>
            <ScanNextButton onClick={startScan} />
          </ActionGroup>
        </ResultShell>
        </div>
      )}

      {phase.kind === "result" && (
        <ScanResultView
          key={scanId}
          result={phase.result}
          token={phase.token}
          eventId={eventId}
          onScanNext={startScan}
          onManualSubmit={resolveScan}
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
      <p className={`mt-3 text-[34px] font-extrabold leading-[1.05] tracking-[-0.03em] ${toneClass}`}>
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
  return (
    <div className="flex w-full flex-col gap-2 border-t-2 border-current/25 pt-4">
      {children}
    </div>
  );
}

function ScanNextButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      className="min-h-[52px] w-full justify-start text-left"
    >
      Scan next
    </Button>
  );
}

// SCAN-03 (D-01 / D-02 / D-03): the manual fallback for a QR that will not
// decode. The trimmed raw string is handed straight to `onSubmit` — the
// caller passes the component-scope `resolveScan`, so the manual path shares
// the SAME single lookupTicket call site, the SAME scanId bump, and the SAME
// server tokenSchema as a camera decode. Deliberately NOT here: any
// client-side format, length, or UUID-shape gate — a bare crypto.randomUUID()
// has no wrapper to parse, and the server schema is the only gate (D-02). The
// Input never binds `value`/`defaultValue` and no screen renders a token back
// as readable text (D-03); autofill/autocorrect are off so the token does not
// linger in the browser. Enter submits natively via the <form> — no key
// handler. Used in three places; only the idle-screen reveal passes autoFocus.
function ManualTokenField({
  onSubmit,
  autoFocus,
}: {
  onSubmit: (token: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <form
      className="flex w-full flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const raw = new FormData(e.currentTarget).get("token");
        onSubmit(String(raw ?? "").trim());
      }}
    >
      <div className="flex w-full flex-col gap-2">
        <Label
          htmlFor="token"
          className="text-[13px] font-semibold text-primary-foreground"
        >
          {MANUAL_FIELD_LABEL}
        </Label>
        <Input
          id="token"
          name="token"
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          placeholder={MANUAL_FIELD_PLACEHOLDER}
          className="min-h-14 w-full font-mono text-[18px] font-semibold tracking-[0.12em] text-foreground"
        />
      </div>
      <Button
        type="submit"
        className="min-h-14 w-full justify-start text-left"
      >
        {MANUAL_SUBMIT_LABEL}
      </Button>
    </form>
  );
}

function AttendeeName({ name }: { name: string }) {
  if (!name) return null;
  // Heading scale (24px/600) per the Typography usage map, wrapping rather
  // than clipping a long name (break-words, reused from the confirmation page).
  return (
    <p className="text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] break-words">
      {name}
    </p>
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
    // Phase 6 D-05: nothing is wrong here — the ticket was simply used. The
    // wrapper overrides the frozen tone="stop" red with --color-neutral-800
    // (#444141) on the glyph and the status word only. [&_svg] is a descendant
    // selector; [&>div>p] reaches ResultShell's own status-word <p> (wrapper →
    // ResultShell's outer <div> → its direct <p>) and NOT the body paragraphs,
    // which sit one level deeper inside the children wrapper. Descendant
    // specificity (0,1,1) beats the utility (0,1,0) — no !important, frozen tag
    // untouched. Ink GO / neutral-800 used / red STOP stay three greyscale values.
    <div className="w-full [&_svg]:text-[var(--color-neutral-800)] [&>div>p]:text-[var(--color-neutral-800)]">
    <ResultShell icon={CircleAlert} word="Already checked in" tone="stop">
      <div className="flex w-full flex-col items-center gap-1">
        <AttendeeName name={name} />
        {hasTimestamp ? (
          <>
            <p className="text-[15px] leading-[1.55]">
              Checked in {formatRelativeTime(checkedInAt)}
            </p>
            <p className="text-[13px] text-muted-foreground">
              {formatCheckInTimestamp(checkedInAt)}
            </p>
          </>
        ) : (
          <p className="text-[15px] leading-[1.55]">Checked in earlier</p>
        )}
      </div>
      <ActionGroup>
        <ScanNextButton onClick={onScanNext} />
      </ActionGroup>
    </ResultShell>
    </div>
  );
}

function ScanResultView({
  result,
  token,
  eventId,
  onScanNext,
  onManualSubmit,
}: {
  result: ScanResult;
  token: string;
  eventId: string;
  onScanNext: () => void;
  // The parent's component-scope resolveScan, threaded in so the not-found
  // branch (rendered here, not in ScannerClient) re-keys through the same
  // single lookup funnel a camera decode uses.
  onManualSubmit: (token: string) => void;
}) {
  // The check-in state lives here, not in the parent: this component is
  // keyed by the scan id, so a fresh scan remounts it and resets
  // useActionState — the "just checked in" screen never bleeds into the next
  // ticket, and no effect is needed to sync it.
  // useActionState's first arg is checkInWithGuard, the client reducer above —
  // never the raw checkInTicket Server Action (D-08). Kept on one line so the
  // wrapper wiring is greppable as a single token.
  const [checkInState, checkInAction, checkInPending] =
    useActionState(checkInWithGuard, initialCheckIn);
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
          <p className="text-[15px] leading-[1.55]">Checked in just now</p>
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
      <div className="w-full self-stretch -mx-4 px-4 py-8 bg-destructive text-primary-foreground [&_svg]:text-primary-foreground [&>div>p]:text-primary-foreground [&_button]:bg-primary-foreground [&_button]:text-destructive [&_button]:border-current/40">
      <ResultShell icon={CircleX} word="Ticket not found" tone="stop">
        <p className="text-[15px] leading-[1.55] break-words">{NOT_FOUND_BODY}</p>
        {/* Auto-shown without a tap so staff can re-key a mistyped or misread code; the view is keyed by scanId so the next lookup remounts it and clears the field. */}
        <div className="flex w-full flex-col gap-2">
          <p className="text-[15px] leading-[1.55] break-words">{MANUAL_HELPER}</p>
          <ManualTokenField onSubmit={onManualSubmit} />
        </div>
        <ActionGroup>
          <ScanNextButton onClick={onScanNext} />
        </ActionGroup>
      </ResultShell>
      </div>
    );
  }

  if (result.kind === "wrong_event") {
    // A generic sentence only — the other event is never named or queried for (D-11), so a ticket scanned at the wrong door leaks nothing about it.
    return (
      <div className="w-full self-stretch -mx-4 px-4 py-8 bg-destructive text-primary-foreground [&_svg]:text-primary-foreground [&>div>p]:text-primary-foreground [&_button]:bg-primary-foreground [&_button]:text-destructive [&_button]:border-current/40">
      <ResultShell icon={Ban} word="Wrong event" tone="stop">
        <p className="text-[15px] leading-[1.55] break-words">{WRONG_EVENT_BODY}</p>
        <ActionGroup>
          <ScanNextButton onClick={onScanNext} />
        </ActionGroup>
      </ResultShell>
      </div>
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
            <dl className="flex w-full items-baseline justify-between gap-4 border-t border-current/15 py-[13px]">
              <dt className="text-[13px] text-muted-foreground">Ticket type</dt>
              <dd className="text-[13px] font-extrabold text-right break-words">
                {result.ticketTypeName}
              </dd>
            </dl>
          )}
          {/* Body size, 600 weight, md (16px) clear above and below — an
              in-scale emphasis so it reads as a call to collect money (D-15),
              not another detail row. The amount is formatted to two places
              without a numeric round-trip (see toTwoDecimals). */}
          <p className="w-full bg-[var(--color-surface)] px-4 py-4 text-left text-[26px] font-extrabold leading-[1.05] tracking-[-0.02em] break-words">
            Balance due: {balanceDisplay} {result.balanceCurrency}
          </p>
          {checkInState.formError && (
            <p role="alert" className="text-[15px] text-destructive break-words">
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
              <span className="text-[13px] font-semibold leading-[1.4]">
                Payment collected
              </span>
            </label>
            {checkInState.errors?.payment_collected?.[0] && (
              <FieldError message={checkInState.errors.payment_collected[0]} />
            )}

            {paymentCollected && (
              <div className="flex w-full flex-col gap-4">
                <div className="flex w-full flex-col gap-2">
                  <Label
                    htmlFor="collected_amount"
                    className="text-[13px] font-semibold"
                  >
                    Amount collected
                  </Label>
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
                  <Label
                    htmlFor="collected_currency"
                    className="text-[13px] font-semibold"
                  >
                    Currency
                  </Label>
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
              className="min-h-[52px] w-full justify-start text-left"
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
          <dl className="flex w-full items-baseline justify-between gap-4 border-t border-current/15 py-[13px]">
            <dt className="text-[13px] text-muted-foreground">Ticket type</dt>
            <dd className="text-[13px] font-extrabold text-right break-words">
              {result.ticketTypeName}
            </dd>
          </dl>
        )}
        {checkInState.formError && (
          <p role="alert" className="text-[15px] text-destructive break-words">
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
            className="min-h-[52px] w-full justify-start text-left"
          >
            {checkInPending ? "Checking in…" : "Check in"}
          </Button>
        </form>
        <ScanNextButton onClick={onScanNext} />
      </ActionGroup>
    </ResultShell>
  );
}
