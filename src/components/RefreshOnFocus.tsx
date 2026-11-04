"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Re-fetches server data when the app becomes visible again, so each phone
// shows the other person's latest entries after switching back.
export default function RefreshOnFocus() {
  const router = useRouter();

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [router]);

  return null;
}
