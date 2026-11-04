"use client";

import Link from "next/link";
import { useRef, useState, useSyncExternalStore } from "react";
import { startSeizureAction, stopSeizureAction } from "@/app/seizures/actions";
import { formatDuration, formatTime } from "@/lib/format";

type Shown = {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  // True when this phone saved the start in this visit (shows "Saved", not "Started").
  saved: boolean;
};

// What still has to reach the server. The ids and times are fixed on the first tap and reused by every retry.
type Pending = {
  stop: { id: string; endedAt: Date } | null;
  start: { id: string; startedAt: Date } | null;
};

type Problem = { message: string; where: "start" | "stop"; canRetry: boolean };

const RETRY_MESSAGE = "Not saved — tap to retry";

// Whole seconds of the client clock; null on the server and during hydration, so nothing mismatches.
function subscribeToSeconds(onChange: () => void) {
  const timer = setInterval(onChange, 1000);
  return () => clearInterval(timer);
}
const getSeconds = () => Math.floor(Date.now() / 1000);
const getServerSeconds = () => null;

// mm:ss under an hour, h:mm:ss from an hour up.
function formatTimer(totalSeconds: number): string {
  const total = Math.max(0, totalSeconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${ss}`;
  return `${String(minutes).padStart(2, "0")}:${ss}`;
}

type SeizureTimes = { id: string; startedAt: Date; endedAt: Date | null };

export default function SeizureButton({
  active,
  last,
}: {
  active: { id: string; startedAt: Date } | null;
  last: SeizureTimes | null;
}) {
  const [shown, setShown] = useState<Shown | null>(
    active ? { id: active.id, startedAt: active.startedAt, endedAt: null, saved: false } : null,
  );
  const [saving, setSaving] = useState<"start" | "stop" | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [confirming, setConfirming] = useState(false);
  const pending = useRef<Pending | null>(null);
  const busy = useRef(false);
  const seconds = useSyncExternalStore(subscribeToSeconds, getSeconds, getServerSeconds);

  // The other phone may start or stop a seizure. A refresh (on focus, or after a save) brings new
  // props; follow them so this phone never offers a fresh start for a seizure that's already logged.
  const serverActiveId = active?.id ?? null;
  const [seenActiveId, setSeenActiveId] = useState(serverActiveId);
  if (serverActiveId !== seenActiveId) {
    setSeenActiveId(serverActiveId);
    const idle = saving === null && !problem?.canRetry;
    if (idle && active && shown?.id !== active.id) {
      setShown({ id: active.id, startedAt: active.startedAt, endedAt: null, saved: false });
    } else if (idle && !active && shown && shown.endedAt === null) {
      // Stopped elsewhere: show its duration. Gone or past 2 hours: back to the idle button.
      setShown(last && last.id === shown.id && last.endedAt ? { ...last, saved: shown.saved } : null);
    }
  }

  const isActive = shown !== null && shown.endedAt === null;

  async function run() {
    if (busy.current || !pending.current) return;
    busy.current = true;
    setProblem(null);
    const work = pending.current;
    try {
      if (work.stop) {
        setSaving("stop");
        const result = await stopSeizureAction(work.stop.id, work.stop.endedAt.toISOString());
        if (!result.ok) {
          pending.current = null;
          setProblem({ message: result.message, where: "stop", canRetry: false });
          return;
        }
        work.stop = null;
        const { id, startedAt, endedAt } = result.value;
        setShown({ id, startedAt, endedAt, saved: false });
      }
      if (work.start) {
        setSaving("start");
        const result = await startSeizureAction(work.start.id, work.start.startedAt.toISOString());
        if (!result.ok) {
          pending.current = null;
          setProblem({ message: result.message, where: "start", canRetry: false });
          return;
        }
        work.start = null;
        const { id, startedAt, endedAt } = result.value;
        setShown({ id, startedAt, endedAt, saved: true });
      }
      pending.current = null;
    } catch {
      // The call threw (no network): keep `pending` so a retry resends the same ids and times.
      setProblem({ message: RETRY_MESSAGE, where: work.stop ? "stop" : "start", canRetry: true });
    } finally {
      busy.current = false;
      setSaving(null);
    }
  }

  function newStart() {
    return { id: crypto.randomUUID(), startedAt: new Date() };
  }

  function tapSeizureNow() {
    if (busy.current) return;
    if (problem?.canRetry && problem.where === "start") return void run();
    if (isActive) {
      setConfirming(true);
      return;
    }
    pending.current = { stop: null, start: newStart() };
    void run();
  }

  function tapStopped() {
    if (busy.current || !shown) return;
    if (problem?.canRetry && problem.where === "stop") return void run();
    pending.current = { stop: { id: shown.id, endedAt: new Date() }, start: null };
    void run();
  }

  function confirmNew() {
    if (busy.current || !shown) return;
    setConfirming(false);
    pending.current = { stop: { id: shown.id, endedAt: new Date() }, start: newStart() };
    void run();
  }

  if (confirming) {
    return (
      <section aria-label="Confirm new seizure" data-compact="true" className="flex flex-col gap-4">
        <p className="text-2xl font-semibold">End the current one and start a new one?</p>
        <button
          type="button"
          onClick={confirmNew}
          className="min-h-24 w-full rounded-2xl bg-alert px-4 text-2xl font-bold text-alert-foreground"
        >
          Start a new seizure
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="min-h-24 w-full rounded-2xl border-2 border-border bg-surface text-3xl font-bold"
        >
          Cancel
        </button>
      </section>
    );
  }

  const seizureLabel =
    saving === "start"
      ? "Saving…"
      : problem?.canRetry && problem.where === "start"
        ? "Retry saving start"
        : "Seizure now";
  const stopLabel =
    saving === "stop"
      ? "Saving…"
      : problem?.canRetry && problem.where === "stop"
        ? "Retry saving stop"
        : "Stopped";

  return (
    <section aria-label="Log a seizure" data-compact={shown !== null} className="flex flex-col gap-4">
      {isActive && shown && (
        <div className="rounded-3xl border-2 border-alert bg-surface p-4 text-center">
          <p className="text-lg font-medium text-muted">Seizure in progress</p>
          <p className="text-7xl font-bold tabular-nums" aria-live="off">
            {seconds === null ? "--:--" : formatTimer(seconds - Math.floor(shown.startedAt.getTime() / 1000))}
          </p>
          <p role="status" className="text-lg text-muted">
            {shown.saved ? "Saved" : "Started"} {formatTime(shown.startedAt)}
          </p>
        </div>
      )}

      {isActive && (
        <button
          type="button"
          onClick={tapStopped}
          disabled={saving !== null}
          className="min-h-32 w-full rounded-2xl bg-foreground text-4xl font-bold text-background disabled:opacity-60"
        >
          {stopLabel}
        </button>
      )}

      {shown && shown.endedAt && (
        <div className="sw-card p-6 text-center">
          <p className="text-lg font-medium text-muted">Last one lasted</p>
          <p className="text-4xl font-bold">
            {formatDuration((shown.endedAt.getTime() - shown.startedAt.getTime()) / 1000)}
          </p>
          <Link
            href={`/seizures/${shown.id}`}
            className="mt-3 flex min-h-tap items-center justify-center rounded-xl border-2 border-brand text-lg font-semibold text-brand"
          >
            Add details
          </Link>
        </div>
      )}

      {!isActive && <p className="text-center text-sm text-muted">Tap once to record the start. Add details later.</p>}
      <button
        type="button"
        onClick={tapSeizureNow}
        disabled={saving !== null}
        className={`sw-action w-full rounded-3xl bg-alert font-bold text-alert-foreground disabled:opacity-60 ${
          isActive ? "min-h-20 text-2xl" : "min-h-48 text-4xl"
        }`}
      >
        {seizureLabel}
      </button>

      {problem && (
        <p role="alert" className="text-lg font-semibold text-alert">
          {problem.message}
        </p>
      )}
    </section>
  );
}
