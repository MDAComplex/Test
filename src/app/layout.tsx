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
      <body className="min-h-full flex flex-col bg-gray-50 text-gray-900">
        <Navbar />
        <main className="flex-1">{children}</main>
        <footer className="bg-gray-900 text-gray-300 text-xs text-center py-4 mt-8">
          Viralo.shop ist ein Demo-Shop. Es findet keine echte Zahlung statt — alle Bestellungen,
          Zahlungen und Versandinformationen sind fiktiv.
        </footer>
      </body>
    </html>
  );
}
