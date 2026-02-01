import type { Question, Section } from '../../src/types/questions';

const SECTION_CONTEXT: Record<Section, string> = {
  'Radiotechnika': 'Kontekst: Pytania dotyczą teorii radiokomunikacji, elektroniki, anten, propagacji fal.',
  'Przepisy': 'Kontekst: Pytania dotyczą przepisów ITU, polskiego prawa telekomunikacyjnego, regulaminu radiokomunikacyjnego.',
  'Bezpieczeństwo': 'Kontekst: Pytania dotyczą BHP, pierwszej pomocy, bezpieczeństwa elektrycznego.',
  'Procedury operatorskie': 'Kontekst: Pytania dotyczą kodów Q, alfabetu fonetycznego, procedur łączności.',
};

export function buildBatchPrompt(questions: Question[]): string {
  const questionBlocks = questions.map((q, index) => {
    const answersText = q.answers.map(a => `${a.letter}. ${a.text}`).join(', ');
    return `[${index + 1}] ID: ${q.id}
Sekcja: ${q.section}
Pytanie: ${q.text}
Odpowiedzi: ${answersText}
Poprawna: ${q.correctAnswerLetter}`;
  }).join('\n\n');

  return `Jesteś ekspertem przygotowującym materiały do egzaminu krótkofalarskiego UKE w Polsce.

Dla każdego z poniższych pytań egzaminacyjnych napisz:
1. HINT (wskazówka): Krótka podpowiedź (1-3 zdania) która pomoże odpowiedzieć na pytanie. Może zawierać:
   - Wzór matematyczny (jeśli dotyczy obliczeń)
   - Kluczową definicję lub regułę
   - Odniesienie do przepisu prawnego (dla pytań z sekcji Przepisy)
   - Praktyczną wskazówkę bezpieczeństwa (dla pytań z sekcji Bezpieczeństwo)
   WAŻNE: NIE podawaj bezpośrednio odpowiedzi w hincie!

2. EXPLANATION (wyjaśnienie): Wyjaśnienie (2-4 zdania) dlaczego poprawna odpowiedź jest właściwa. Wyjaśnij też krótko dlaczego pozostałe odpowiedzi są błędne.

Konteksty sekcji:
${Object.entries(SECTION_CONTEXT).map(([section, context]) => `- ${section}: ${context}`).join('\n')}

PYTANIA:
${questionBlocks}

WAŻNE: Odpowiedz TYLKO jako JSON array, bez żadnego dodatkowego tekstu przed ani po JSON:
[
  {"id": "Q1", "hint": "tekst wskazówki po polsku", "explanation": "tekst wyjaśnienia po polsku"},
  {"id": "Q2", "hint": "...", "explanation": "..."}
]`;
}

export function getSectionContext(section: Section): string {
  return SECTION_CONTEXT[section];
}
