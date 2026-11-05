import { Suspense } from "react";
import { connection } from "next/server";
import { getProfile } from "@/lib/data/profile";
import { getDb } from "@/lib/db/client";
import { todayKey } from "@/lib/time";
import { ProfileSection } from "./ProfileForm";

async function ProfileContent() {
  await connection();
  const profile = await getProfile(getDb());
  return (
    <ProfileSection
      profile={profile ? { ...profile, updatedAt: profile.updatedAt.toISOString() } : null}
      today={todayKey()}
    />
  );
}

export default function HistoryPage() {
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-4xl font-semibold">History</h1>
      <Suspense fallback={<p className="mt-2 text-center text-base text-muted">Loading…</p>}>
        <ProfileContent />
      </Suspense>
    </main>
  );
}
