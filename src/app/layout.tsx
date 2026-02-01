import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "UKE Flashcards",
  description: "Prepare for the UKE amateur radio exam with interactive flashcards",
};

function Navigation() {
  return (
    <nav className="bg-slate-800 text-white shadow-lg">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="text-xl font-bold hover:text-slate-300 transition-colors">
            UKE Flashcards
          </Link>
          <div className="flex gap-6">
            <Link
              href="/study"
              className="hover:text-slate-300 transition-colors font-medium"
            >
              Study
            </Link>
            <Link
              href="/dashboard"
              className="hover:text-slate-300 transition-colors font-medium"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pl">
      <body className="bg-slate-100 min-h-screen">
        <Navigation />
        <main className="max-w-4xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
