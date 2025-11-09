import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

import { AuthProvider } from "@/components/auth-provider";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "The Trip | Psychedelic France Planner",
  description: "Plan a cinematic France itinerary with AI-driven suggestions, travel time intel, and hotel picks.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-black`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
