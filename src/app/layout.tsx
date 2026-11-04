import type { Metadata, Viewport } from "next";
import "./globals.css";
import RefreshOnFocus from "@/components/RefreshOnFocus";
import TabBar from "@/components/TabBar";

export const metadata: Metadata = {
  title: "SeizureWatch",
  description: "Track your dog's seizures, medication and bloodwork in one place.",
  appleWebApp: {
    capable: true,
    title: "SeizureWatch",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#101318" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto min-h-dvh max-w-2xl px-4 pt-6 pb-[calc(var(--spacing-tabbar)+env(safe-area-inset-bottom)+1.5rem)]">
          {children}
        </div>
        <TabBar />
        <RefreshOnFocus />
      </body>
    </html>
  );
}
