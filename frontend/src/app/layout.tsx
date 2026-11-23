import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter, Manrope } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter-loaded", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-manrope-loaded", display: "swap" });

export const metadata: Metadata = {
  title: "CompVista",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${manrope.variable}`}>
      <body>{children}</body>
    </html>
  );
}
