import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "aRvEn Admin",
  description: "aRvEn platform — admin console",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-bg text-text">{children}</body>
    </html>
  );
}
