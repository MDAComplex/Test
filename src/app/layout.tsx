import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Viralo.shop – Alles was du brauchst",
  description: "Der Demo-Onlineshop von Elektronik bis Beauty – mit Fake-Checkout zum Testen.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white text-[#1c1c1f]">
        <Navbar />
        <main className="flex-1 pb-20 sm:pb-0">{children}</main>
        <footer className="bg-[#f7f7f8] text-[#6b6b76] text-xs text-center py-4 pb-24 sm:pb-4 px-4 space-x-3">
          <span>
            🎮 Dies ist ein Spiel/Demo — es werden keine echten Bestellungen ausgelöst und kein Geld eingezogen.
          </span>
          <a href="/datenschutz" className="underline">Datenschutz</a>
        </footer>
      </body>
    </html>
  );
}
