/**
 * Script to fetch UKE exam questions from egzaminkf.pl
 *
 * This script:
 * 1. Reads credentials from .credentials file
 * 2. Authenticates to egzaminkf.pl
 * 3. Fetches all questions from the question list (pytania_lista.php)
 * 4. Parses and saves them to data/questions.json
 */

import * as fs from "fs";
import * as path from "path";
import * as cheerio from "cheerio";
import type { Question, QuestionBank, Section, Answer } from "../src/types/questions";

const BASE_URL = "https://egzaminkf.pl";
const IMAGES_DIR = path.join(process.cwd(), "public", "images", "questions");
const IMAGE_DOWNLOAD_DELAY_MS = 300;

/** Extended question type with temporary raw image URL from source */
interface QuestionWithRawImage extends Question {
  _rawImageUrl?: string | null;
}

interface Credentials {
  email: string;
  password: string;
}

/**
 * Read credentials from .credentials file
 * Format: email: <email>\npassword: <password>
 */
function readCredentials(): Credentials {
  const credentialsPath = path.join(process.cwd(), ".credentials");

  if (!fs.existsSync(credentialsPath)) {
    throw new Error(
      ".credentials file not found. Create it with:\nemail: your@email.com\npassword: yourpassword"
    );
  }

  const content = fs.readFileSync(credentialsPath, "utf-8");
  const lines = content.trim().split("\n");

  let email = "";
  let password = "";

  for (const line of lines) {
    if (line.startsWith("email:")) {
      email = line.replace("email:", "").trim();
    } else if (line.startsWith("password:")) {
      password = line.replace("password:", "").trim();
    }
  }

  if (!email || !password) {
    throw new Error(
      "Invalid .credentials format. Expected:\nemail: your@email.com\npassword: yourpassword"
    );
  }

  return { email, password };
}

/**
 * Create a cookie jar to maintain session across requests
 */
class CookieJar {
  private cookies: Map<string, string> = new Map();

  setCookies(setCookieHeaders: string[] | null): void {
    if (!setCookieHeaders) return;

    for (const header of setCookieHeaders) {
      const parts = header.split(";")[0];
      const [name, value] = parts.split("=");
      if (name && value) {
        this.cookies.set(name.trim(), value.trim());
      }
    }
  }

  getCookieHeader(): string {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}

/**
 * Authenticate to egzaminkf.pl and return session cookies
 */
async function authenticate(
  credentials: Credentials,
  cookieJar: CookieJar
): Promise<void> {
  console.log("Authenticating to egzaminkf.pl...");

  // First, get the login page to get CSRF token and initial cookies
  const loginPageResponse = await fetch(`${BASE_URL}/login.php`, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    redirect: "manual",
  });

  const setCookies = loginPageResponse.headers.getSetCookie();
  cookieJar.setCookies(setCookies);

  // Parse the login page to get CSRF token
  const loginPageHtml = await loginPageResponse.text();
  const $ = cheerio.load(loginPageHtml);
  const csrfToken = $('input[name="csrf"]').val() as string;

  if (!csrfToken) {
    console.warn("Could not find CSRF token on login page");
  }

  // Submit login form with CSRF token
  const formData = new URLSearchParams();
  if (csrfToken) {
    formData.append("csrf", csrfToken);
  }
  formData.append("email", credentials.email);
  formData.append("password", credentials.password);

  const loginResponse = await fetch(`${BASE_URL}/login.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieJar.getCookieHeader(),
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Referer: `${BASE_URL}/login.php`,
    },
    body: formData.toString(),
    redirect: "manual",
  });

  cookieJar.setCookies(loginResponse.headers.getSetCookie());

  // Check if login was successful by following redirect or checking response
  if (loginResponse.status === 302 || loginResponse.status === 301) {
    console.log("Login successful (redirect detected)");
    return;
  }

  const html = await loginResponse.text();
  if (html.includes("Wyloguj") || html.includes("Moje konto")) {
    console.log("Login successful");
  } else if (html.includes("Nieprawidłowy") || html.includes("błąd") || html.includes("niepoprawne")) {
    throw new Error("Authentication failed: Invalid credentials or login error");
  } else {
    // Try to verify by fetching a protected page
    const testResponse = await fetch(`${BASE_URL}/me.php`, {
      headers: {
        Cookie: cookieJar.getCookieHeader(),
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    const testHtml = await testResponse.text();
    if (testHtml.includes("Wyloguj") || testHtml.includes("Moje konto")) {
      console.log("Login successful (verified via /me.php)");
    } else {
      throw new Error("Login failed - could not verify authentication");
    }
  }
}

/**
 * Map Polish section names to our Section type
 */
function mapSection(sectionText: string): Section {
  const normalized = sectionText.trim().toLowerCase();

  if (normalized.includes("radiotechnik")) {
    return "Radiotechnika";
  } else if (normalized.includes("przepis")) {
    return "Przepisy";
  } else if (normalized.includes("bezpiecze") || normalized.includes("bhp")) {
    return "Bezpieczeństwo";
  } else if (normalized.includes("procedur") || normalized.includes("operator")) {
    return "Procedury operatorskie";
  }

  // Default to most common section if unknown
  console.warn(`Unknown section: "${sectionText}", defaulting to Radiotechnika`);
  return "Radiotechnika";
}

/**
 * Download an image from the source site and save locally
 * @param relativeUrl - The relative URL from the source (e.g., "/images/a_1_265.png")
 * @param questionId - The question ID to use for the local filename
 * @param cookieJar - Cookie jar for authenticated requests
 * @returns The local URL path or null if download failed
 */
async function downloadImage(
  relativeUrl: string,
  questionId: string,
  cookieJar: CookieJar
): Promise<string | null> {
  try {
    const url = `${BASE_URL}${relativeUrl}`;
    const response = await fetch(url, {
      headers: {
        Cookie: cookieJar.getCookieHeader(),
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      console.warn(`  Failed to fetch image for ${questionId}: ${response.status}`);
      return null;
    }

    // Get extension from original URL
    const ext = path.extname(relativeUrl) || ".png";
    const filename = `${questionId}${ext}`;
    const localPath = path.join(IMAGES_DIR, filename);

    // Skip if already exists
    if (fs.existsSync(localPath)) {
      console.log(`  Image already exists: ${filename}`);
      return `/images/questions/${filename}`;
    }

    const buffer = await response.arrayBuffer();
    fs.writeFileSync(localPath, Buffer.from(buffer));
    console.log(`  Downloaded: ${filename}`);
    return `/images/questions/${filename}`;
  } catch (err) {
    console.warn(`  Failed to download image for ${questionId}:`, err);
    return null;
  }
}

/**
 * Merge new questions with existing data to preserve hints and explanations
 */
function mergeWithExisting(newQuestions: Question[]): Question[] {
  const existingPath = path.join(process.cwd(), "data", "questions.json");
  if (!fs.existsSync(existingPath)) {
    console.log("No existing questions.json found, skipping merge");
    return newQuestions;
  }

  console.log("Merging with existing questions to preserve hints/explanations...");
  const existing: QuestionBank = JSON.parse(fs.readFileSync(existingPath, "utf-8"));
  const existingMap = new Map(existing.questions.map((q) => [q.id, q]));

  let preservedCount = 0;
  const merged = newQuestions.map((q) => {
    const old = existingMap.get(q.id);
    if (old && (old.hint || old.explanation)) {
      preservedCount++;
    }
    return {
      ...q,
      hint: q.hint || old?.hint,
      explanation: q.explanation || old?.explanation,
    };
  });

  console.log(`Preserved hints/explanations for ${preservedCount} questions`);
  return merged;
}

/**
 * Fetch a single page of questions from the question list
 */
async function fetchQuestionListPage(
  pageNum: number,
  cookieJar: CookieJar
): Promise<string> {
  // bank=new for new 2024+ questions, perm=A for category 1 license
  const url = `${BASE_URL}/pytania_lista.php?bank=new&perm=A&page=${pageNum}`;
  console.log(`Fetching question list page ${pageNum}...`);

  const response = await fetch(url, {
    headers: {
      Cookie: cookieJar.getCookieHeader(),
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch page ${pageNum}: ${response.status}`);
  }

  return response.text();
}

/**
 * Parse questions from the question list page HTML
 * The list shows questions with the correct answer marked as .is-ok
 */
function parseQuestionsFromListPage(html: string): QuestionWithRawImage[] {
  const $ = cheerio.load(html);
  const questions: QuestionWithRawImage[] = [];

  // Each question is in a .p-card container
  $(".p-card").each((_, element) => {
    const $card = $(element);

    // Extract question number
    const numText = $card.find(".p-qnum").text().trim();
    const numMatch = numText.match(/(\d+)/);
    const number = numMatch ? parseInt(numMatch[1], 10) : 0;

    // Extract question text (everything in .p-q except the number span)
    const $q = $card.find(".p-q");
    const questionText = $q.clone().children(".p-qnum").remove().end().text().trim();

    // Extract section/category
    const categoryText = $card.find(".p-cat").text().trim();
    const sectionMatch = categoryText.match(/Dział:\s*(.+)/i);
    const sectionName = sectionMatch ? sectionMatch[1].trim() : "Radiotechnika";
    const section = mapSection(sectionName);

    // Extract image URL if present (images are in .p-img > img)
    const $img = $card.find(".p-img img");
    const rawImageUrl = $img.attr("src") || null;

    // Extract answers
    const answers: Answer[] = [];
    let correctAnswerLetter = "";

    $card.find(".p-ans").each((_, ansEl) => {
      const $ans = $(ansEl);
      const ansText = $ans.text().trim();

      // Answer format: "A) answer text"
      const ansMatch = ansText.match(/^([A-Z])\)\s*(.+)$/);
      if (ansMatch) {
        const letter = ansMatch[1];
        const text = ansMatch[2].trim();

        answers.push({ letter, text });

        // Check if this is the correct answer (marked with is-ok class)
        if ($ans.hasClass("is-ok")) {
          correctAnswerLetter = letter;
        }
      }
    });

    if (questionText && answers.length > 0 && correctAnswerLetter) {
      questions.push({
        id: `Q${number}`,
        number,
        text: questionText,
        answers,
        correctAnswerLetter,
        section,
        _rawImageUrl: rawImageUrl,
      });
    }
  });

  return questions;
}

/**
 * Determine the total number of pages in the question list
 */
function getTotalPages(html: string): number {
  const $ = cheerio.load(html);
  let maxPage = 1;

  // Try to find "Strona: X/Y" or "Strona X / Y" pattern
  const pageInfoMatch = html.match(/Strona[:\s]*(\d+)\s*[\/]\s*(\d+)/i);
  if (pageInfoMatch) {
    maxPage = parseInt(pageInfoMatch[2], 10);
    return maxPage;
  }

  // Fallback: Look for pagination links
  $("a").each((_, el) => {
    const href = $(el).attr("href") || "";
    const pageMatch = href.match(/page=(\d+)/);
    if (pageMatch) {
      const pageNum = parseInt(pageMatch[1], 10);
      if (pageNum > maxPage) {
        maxPage = pageNum;
      }
    }
  });

  return maxPage;
}

/**
 * Fetch all questions from the question list pages
 */
async function fetchAllQuestionsFromList(cookieJar: CookieJar): Promise<QuestionWithRawImage[]> {
  console.log("Fetching questions from question list (pytania_lista.php)...\n");

  const allQuestions: QuestionWithRawImage[] = [];

  // Fetch first page to determine total pages
  const firstPageHtml = await fetchQuestionListPage(1, cookieJar);
  const totalPages = getTotalPages(firstPageHtml);
  console.log(`Found ${totalPages} pages of questions\n`);

  // Parse first page
  const firstPageQuestions = parseQuestionsFromListPage(firstPageHtml);
  allQuestions.push(...firstPageQuestions);
  console.log(`Page 1: Found ${firstPageQuestions.length} questions`);

  // Fetch remaining pages
  for (let page = 2; page <= totalPages; page++) {
    try {
      const html = await fetchQuestionListPage(page, cookieJar);
      const pageQuestions = parseQuestionsFromListPage(html);
      allQuestions.push(...pageQuestions);
      console.log(`Page ${page}: Found ${pageQuestions.length} questions (total: ${allQuestions.length})`);

      // Small delay between requests to be respectful
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (err) {
      console.error(`Error fetching page ${page}:`, err);
    }
  }

  return allQuestions;
}

/**
 * Save questions to JSON file
 */
function saveQuestions(questions: Question[]): void {
  const dataDir = path.join(process.cwd(), "data");

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Calculate section counts
  const sectionCounts: Record<Section, number> = {
    Radiotechnika: 0,
    Przepisy: 0,
    Bezpieczeństwo: 0,
    "Procedury operatorskie": 0,
  };

  for (const q of questions) {
    sectionCounts[q.section]++;
  }

  const questionBank: QuestionBank = {
    questions,
    metadata: {
      fetchedAt: new Date().toISOString(),
      source: BASE_URL,
      totalQuestions: questions.length,
      questionsBySection: sectionCounts,
    },
  };

  const outputPath = path.join(dataDir, "questions.json");
  fs.writeFileSync(outputPath, JSON.stringify(questionBank, null, 2), "utf-8");
  console.log(`\nSaved ${questions.length} questions to ${outputPath}`);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    console.log("=== UKE Flashcards Question Fetcher ===\n");

    // Step 1: Read credentials
    const credentials = readCredentials();
    console.log(`Using email: ${credentials.email}`);

    // Step 2: Create cookie jar and authenticate
    const cookieJar = new CookieJar();
    await authenticate(credentials, cookieJar);

    // Step 3: Fetch all questions from the question list
    const questions = await fetchAllQuestionsFromList(cookieJar);

    if (questions.length === 0) {
      throw new Error("Failed to fetch any questions");
    }

    // Step 4: Deduplicate by question text (in case of any duplicates across pages)
    const uniqueQuestions = new Map<string, QuestionWithRawImage>();
    for (const q of questions) {
      const key = q.text.toLowerCase().replace(/\s+/g, " ").trim();
      if (!uniqueQuestions.has(key)) {
        uniqueQuestions.set(key, q);
      }
    }

    // Renumber questions sequentially
    const renumberedQuestions = Array.from(uniqueQuestions.values()).map((q, index) => ({
      ...q,
      id: `Q${index + 1}`,
      number: index + 1,
    }));

    // Step 5: Download images for questions that have them
    if (!fs.existsSync(IMAGES_DIR)) {
      fs.mkdirSync(IMAGES_DIR, { recursive: true });
    }

    const questionsWithImages = renumberedQuestions.filter((q) => q._rawImageUrl);
    console.log(`\nDownloading images for ${questionsWithImages.length} questions...`);

    for (const q of renumberedQuestions) {
      if (q._rawImageUrl) {
        const localUrl = await downloadImage(q._rawImageUrl, q.id, cookieJar);
        if (localUrl) {
          q.imageUrl = localUrl;
        }
        // Rate limit image downloads
        await new Promise((resolve) => setTimeout(resolve, IMAGE_DOWNLOAD_DELAY_MS));
      }
      // Remove temporary property
      delete q._rawImageUrl;
    }

    // Step 6: Merge with existing data to preserve hints/explanations
    const finalQuestions = mergeWithExisting(renumberedQuestions);

    // Step 7: Save to file
    saveQuestions(finalQuestions);

    console.log("\n=== Summary ===");
    console.log(`Total unique questions: ${finalQuestions.length}`);
    const imageCount = finalQuestions.filter((q) => q.imageUrl).length;
    console.log(`Questions with images: ${imageCount}`);
    console.log("Questions by section:");
    const sectionCounts: Record<string, number> = {};
    for (const q of finalQuestions) {
      sectionCounts[q.section] = (sectionCounts[q.section] || 0) + 1;
    }
    for (const [section, count] of Object.entries(sectionCounts)) {
      console.log(`  ${section}: ${count}`);
    }

    console.log("\nDone!");
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

main();
