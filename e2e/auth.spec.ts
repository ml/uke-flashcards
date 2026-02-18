import { test, expect } from '@playwright/test';

const TEST_EMAIL = `test-${Date.now()}@example.com`;
const TEST_PASSWORD = 'testpassword123';

test.describe('Auth flow', () => {
  test('register page loads and form submits correctly', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('h1')).toContainText('Rejestracja');

    await page.fill('#email', TEST_EMAIL);
    await page.fill('#password', TEST_PASSWORD);
    await page.fill('#confirm-password', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    // Should redirect to /study
    await page.waitForURL('/study');
    await expect(page).toHaveURL('/study');
  });

  test('after registration, user sees profile dropdown in nav', async ({ page }) => {
    // Register a unique user
    const email = `nav-${Date.now()}@example.com`;
    await page.goto('/register');
    await page.fill('#email', email);
    await page.fill('#password', TEST_PASSWORD);
    await page.fill('#confirm-password', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('/study');

    // Should see profile avatar button (first letter of email)
    const avatar = page.locator('nav button.rounded-full');
    await expect(avatar).toBeVisible();
  });

  test('logout redirects to home, nav shows login/register links', async ({ page }) => {
    // Register and login
    const email = `logout-${Date.now()}@example.com`;
    await page.goto('/register');
    await page.fill('#email', email);
    await page.fill('#password', TEST_PASSWORD);
    await page.fill('#confirm-password', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('/study');

    // Click avatar to open dropdown
    await page.click('nav button.rounded-full');
    // Click Wyloguj
    await page.click('text=Wyloguj');
    await page.waitForURL('/');

    // Should see login/register links
    await expect(page.locator('nav a[href="/login"]')).toBeVisible();
    await expect(page.locator('nav a[href="/register"]')).toBeVisible();
  });

  test('login with registered credentials works', async ({ page }) => {
    // First register
    const email = `login-${Date.now()}@example.com`;
    await page.goto('/register');
    await page.fill('#email', email);
    await page.fill('#password', TEST_PASSWORD);
    await page.fill('#confirm-password', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('/study');

    // Logout
    await page.click('nav button.rounded-full');
    await page.click('text=Wyloguj');
    await page.waitForURL('/');

    // Now login
    await page.goto('/login');
    await page.fill('#email', email);
    await page.fill('#password', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('/study');

    // Should be logged in
    const avatar = page.locator('nav button.rounded-full');
    await expect(avatar).toBeVisible();
  });

  test('anonymous user sees dismissable banner', async ({ page }) => {
    // Clear cookies to be anonymous
    await page.context().clearCookies();
    await page.goto('/study');

    // Should see the anon banner
    const banner = page.locator('text=Zaloguj się lub utwórz konto');
    await expect(banner).toBeVisible();

    // Dismiss it
    await page.click('button[aria-label="Zamknij"]');
    await expect(banner).not.toBeVisible();
  });

  test('banner dismissal persists on reload within 24h', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/study');

    // Dismiss banner
    const banner = page.locator('text=Zaloguj się lub utwórz konto');
    await expect(banner).toBeVisible();
    await page.click('button[aria-label="Zamknij"]');
    await expect(banner).not.toBeVisible();

    // Reload
    await page.reload();
    // Banner should still be hidden
    await page.waitForTimeout(500);
    await expect(banner).not.toBeVisible();
  });

  test('dashboard shows login-required message for anonymous users', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/dashboard');

    await expect(page.locator('text=Zaloguj się, aby zobaczyć swoje postępy')).toBeVisible();
  });

  test('study page works for anonymous users', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/study');

    // Should see a question
    await page.waitForSelector('[class*="rounded-xl"]', { timeout: 10000 });

    // Should see login prompt instead of session button
    await expect(page.locator('text=Zaloguj się, aby rozpocząć sesję')).toBeVisible();
  });

  test('anonymous user can answer questions (client-side feedback)', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/study');

    // Wait for question to load
    await page.waitForSelector('button:has-text("A.")', { timeout: 10000 });

    // Click an answer
    await page.click('button:has-text("A.")');

    // Should see feedback (either Correct! or Incorrect.)
    const feedback = page.locator('[class*="rounded-lg"]:has-text("Correct"), [class*="rounded-lg"]:has-text("Incorrect")');
    await expect(feedback.first()).toBeVisible({ timeout: 5000 });
  });

  test('anonymous user sees login prompt instead of Start Session button', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/study');

    // Wait for page to load
    await page.waitForSelector('button:has-text("A."), a:has-text("Zaloguj się")', { timeout: 10000 });

    // Should NOT see "Start Session" button
    await expect(page.locator('button:has-text("Start Session")')).not.toBeVisible();

    // Should see login prompt
    await expect(page.locator('a:has-text("Zaloguj się, aby rozpocząć sesję")')).toBeVisible();
  });
});
