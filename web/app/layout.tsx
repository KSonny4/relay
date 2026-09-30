import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PresentBridge } from "@/components/present-bridge";
import { PRESENT_LISTENER_SCRIPT } from "@/lib/present-listener-script";
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
  title: "Relay",
  description: "Record a pitch. Execution, usefulness, and clarity update while you speak.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: PRESENT_LISTENER_SCRIPT }} />
        <PresentBridge />
        {children}
      </body>
    </html>
  );
}
