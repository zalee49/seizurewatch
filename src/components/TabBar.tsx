"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import NavIcon, { type NavIconName } from "@/components/NavIcon";

const tabs: { href: string; label: string; icon: NavIconName }[] = [
  { href: "/", label: "Today", icon: "today" },
  { href: "/calendar", label: "Calendar", icon: "calendar" },
  { href: "/meds", label: "Meds", icon: "meds" },
  { href: "/bloodwork", label: "Bloodwork", icon: "bloodwork" },
  { href: "/history", label: "History", icon: "history" },
];

// `pathname` is null while it isn't known yet; no tab is highlighted then.
function Bar({ pathname }: { pathname: string | null }) {
  return (
    <nav
      aria-label="Sections"
      className="sw-tabbar fixed inset-x-0 bottom-0 z-10 pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-2xl gap-1 px-3 py-2">
        {tabs.map((tab) => {
          const isActive =
            pathname !== null && (tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href));
          return (
            <li key={tab.href} className="sw-tab-item flex-1" data-icon={tab.icon}>
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl text-xs font-medium ${
                  isActive ? "sw-tab-active font-bold" : "text-muted hover:bg-brand/5 hover:text-brand"
                }`}
              >
                <span className="sw-tab-icon"><NavIcon name={tab.icon} /></span>
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function CurrentBar() {
  return <Bar pathname={usePathname()} />;
}

// On a route with a runtime param (`/seizures/[id]`) the pathname isn't known at prerender, so
// `usePathname` suspends; the same bar without a highlight stands in until it resolves.
export default function TabBar() {
  return (
    <Suspense fallback={<Bar pathname={null} />}>
      <CurrentBar />
    </Suspense>
  );
}
