"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type Tab = {
  href: string;
  label: string;
  icon: ReactNode;
};

const iconProps = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

const tabs: Tab[] = [
  {
    href: "/",
    label: "Today",
    icon: (
      <svg {...iconProps}>
        <path d="M3 12h4l3-8 4 16 3-8h4" />
      </svg>
    ),
  },
  {
    href: "/calendar",
    label: "Calendar",
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </svg>
    ),
  },
  {
    href: "/meds",
    label: "Meds",
    icon: (
      <svg {...iconProps}>
        <rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)" />
        <path d="M9.5 9.5l5 5" />
      </svg>
    ),
  },
  {
    href: "/bloodwork",
    label: "Bloodwork",
    icon: (
      <svg {...iconProps}>
        <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />
      </svg>
    ),
  },
  {
    href: "/history",
    label: "History",
    icon: (
      <svg {...iconProps}>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    ),
  },
];

export default function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-2xl gap-1 px-2 py-2">
        {tabs.map((tab) => {
          const isActive =
            tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-tabbar flex-col items-center justify-center gap-1 rounded-2xl text-xs font-medium ${
                  isActive ? "bg-brand/10 font-semibold text-brand" : "text-muted"
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
