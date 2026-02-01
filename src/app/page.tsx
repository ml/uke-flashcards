import Link from "next/link";

export default function Home() {
  return (
    <div className="text-center">
      <h1 className="text-4xl font-bold text-slate-800 mb-4">
        UKE Flashcards
      </h1>
      <p className="text-slate-600 mb-8 text-lg">
        Przygotuj się do egzaminu na świadectwo operatora urządzeń radiowych
      </p>

      <div className="flex justify-center gap-4">
        <Link
          href="/study"
          className="bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors shadow-md"
        >
          Start Learning
        </Link>
        <Link
          href="/dashboard"
          className="bg-slate-200 text-slate-700 px-8 py-3 rounded-lg font-semibold hover:bg-slate-300 transition-colors shadow-md"
        >
          View Progress
        </Link>
      </div>
    </div>
  );
}
