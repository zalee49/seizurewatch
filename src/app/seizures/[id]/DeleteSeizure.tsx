"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteSeizureAction } from "@/app/seizures/actions";

export default function DeleteSeizure({ id }: { id: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function confirmDelete() {
    setDeleting(true);
    setProblem(null);
    try {
      const result = await deleteSeizureAction(id);
      if (result.ok) {
        // Replace, so Back doesn't return to a page that no longer exists.
        router.replace("/");
        return;
      }
      setProblem(result.message);
    } catch {
      setProblem("Not deleted — check the connection and try again.");
    }
    setDeleting(false);
    setConfirming(false);
  }

  return (
    <section aria-label="Delete this seizure" className="flex flex-col gap-3">
      {confirming ? (
        <div className="rounded-xl border-2 border-alert p-4">
          <p className="text-lg font-semibold">Delete this seizure and everything recorded with it?</p>
          <p className="mt-1 text-sm text-muted">This can&apos;t be undone.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={confirmDelete}
              disabled={deleting}
              className="min-h-14 rounded-xl bg-alert text-lg font-bold text-alert-foreground disabled:opacity-60"
            >
              {deleting ? "Deleting…" : "Delete seizure"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={deleting}
              className="min-h-14 rounded-xl border-2 border-border text-lg font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="min-h-tap w-full rounded-xl border-2 border-alert text-base font-semibold text-alert"
        >
          Delete this seizure
        </button>
      )}
      {problem && (
        <p role="alert" className="text-base font-semibold text-alert">
          {problem}
        </p>
      )}
    </section>
  );
}
