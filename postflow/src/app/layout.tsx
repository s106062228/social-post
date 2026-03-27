import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
