import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dryrun — Synthetic User Testing",
  description: "AI agents that test your product like real users",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#0a0a0a] text-[#F5F5F5]`}
      >
        <div className="min-h-screen">
          <nav className="border-b border-dashed border-[#333] px-6 py-4">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <a href="/" className="text-2xl font-black tracking-tighter">
                DRYRUN
              </a>
              <div className="flex items-center gap-6">
                <span className="text-xs text-[#555] font-mono uppercase tracking-widest">
                  Synthetic User Testing
                </span>
              </div>
            </div>
          </nav>
          <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
        </div>
        <Toaster theme="dark" />
      </body>
    </html>
  );
}
