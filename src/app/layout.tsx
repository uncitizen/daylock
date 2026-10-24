import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

// Simplified font configuration for Next.js 16 Turbopack compatibility
const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: "700",
});

const body = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body",
  weight: "400",
});

export const metadata: Metadata = {
  title: "Daylock",
  description: "My Day planner with hard repeats and calendar fill-work",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
