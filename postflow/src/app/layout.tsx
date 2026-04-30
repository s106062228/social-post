import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { THEME_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "PostFlow — Social Media Scheduler",
  description:
    "Schedule and manage your social media posts across Facebook, Instagram, and Threads.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* Inline script to apply theme before first paint, preventing flash */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
