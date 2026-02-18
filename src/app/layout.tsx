import type { Metadata } from "next";
import { HintsProvider } from "@/components/HintsContext";
import { AuthProvider } from "@/components/AuthContext";
import { Navigation } from "@/components/Navigation";
import { AnonBanner } from "@/components/AnonBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: "UKE Flashcards",
  description: "Prepare for the UKE amateur radio exam with interactive flashcards",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pl">
      <body className="bg-slate-100 min-h-screen">
        <AuthProvider>
          <HintsProvider>
            <AnonBanner />
            <Navigation />
            <main className="max-w-4xl mx-auto px-4 py-8">{children}</main>
          </HintsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
