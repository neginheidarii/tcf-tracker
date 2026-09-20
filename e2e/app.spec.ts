import { expect, test, type Browser, type Page } from "@playwright/test";

/* The promises that only a browser can check: an account, one record on two
   devices at once, and a session that survives losing the network. */

let counter = 0;
const freshAccount = () => ({
  email: `e2e-${Date.now()}-${counter++}@example.test`,
  password: "study-hard-2026",
});

/** The tab bar, which shares its labels with buttons inside the day. */
const tab = (page: Page, name: string) =>
  page.getByRole("navigation").getByRole("button", { name });

async function createAccount(page: Page, account: { email: string; password: string }) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account instead" }).click();
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(tab(page, "Today")).toBeVisible();
}

async function signIn(page: Page, account: { email: string; password: string }) {
  await page.goto("/");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(tab(page, "Today")).toBeVisible();
}

/** A second device looking at the same account. */
async function secondDevice(browser: Browser, account: { email: string; password: string }) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, account);
  return { context, page };
}

test("a new account arrives with a usable plan", async ({ page }) => {
  await createAccount(page, freshAccount());

  await expect(page.locator(".dayNum")).toContainText("Day 1");
  await expect(page.locator(".cell")).toHaveCount(75);
  await expect(page.getByText("Nothing planned yet.")).toBeVisible();
});

test("the day survives a reload, because it is on the server", async ({ page }) => {
  const account = freshAccount();
  await createAccount(page, account);

  await page.getByRole("button", { name: /Productive/ }).click();
  await expect(page.locator(".task")).toHaveCount(9);
  await expect(page.locator(".sync")).toHaveText("Synced");

  await page.reload();
  await expect(page.locator(".task")).toHaveCount(9);
});

test("progress logged on one device appears on the other without a reload", async ({ page, browser }) => {
  const account = freshAccount();
  await createAccount(page, account);
  await page.getByRole("button", { name: /Chill/ }).click();
  await expect(page.locator(".task")).toHaveCount(8);
  await expect(page.locator(".sync")).toHaveText("Synced");

  const other = await secondDevice(browser, account);
  await expect(other.page.locator(".task")).toHaveCount(8);

  /* tick the first task on the first device */
  await page.locator(".task").first().locator(".check").click();
  await expect(page.locator(".task.done")).toHaveCount(1);

  /* it turns up on the second device on its own */
  await expect(other.page.locator(".task.done")).toHaveCount(1);

  /* and back the other way, on a counter rather than a tick */
  await other.page.locator(".task").nth(1).getByRole("button", { name: /^More/ }).click();
  await expect(page.locator(".task").nth(1).locator(".cnum")).toContainText("5");

  await other.context.close();
});

test("a day cleared on one device empties on the other", async ({ page, browser }) => {
  const account = freshAccount();
  await createAccount(page, account);
  await page.getByRole("button", { name: /Chill/ }).click();
  await expect(page.locator(".sync")).toHaveText("Synced");

  const other = await secondDevice(browser, account);
  await expect(other.page.locator(".task")).toHaveCount(8);

  await page.getByRole("button", { name: "Clear the day" }).click();
  await page.getByRole("button", { name: "Yes, clear the day" }).click();

  await expect(other.page.getByText("Nothing planned yet.")).toBeVisible();
  await other.context.close();
});

test("work done offline is kept, and sent when the network returns", async ({ page, context, browserName }) => {
  const account = freshAccount();
  await createAccount(page, account);
  await page.getByRole("button", { name: /Chill/ }).click();
  await expect(page.locator(".sync")).toHaveText("Synced");

  /* The shell has to be cached, and the worker has to be controlling this page,
     before pulling the plug — otherwise the reload below has nothing to load. A
     freshly installed worker doesn't control the page that installed it until it
     claims it. */
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      navigator.serviceWorker.addEventListener("controllerchange", done, { once: true });
      setTimeout(done, 10_000);
    });
  });
  await context.setOffline(true);

  /* the app keeps working, and says what it is holding */
  await page.locator(".task").first().locator(".check").click();
  await expect(page.locator(".task.done")).toHaveCount(1);
  await expect(page.locator(".sync")).toHaveText("Offline");
  await expect(page.locator(".syncBar")).toContainText("waiting");

  /* A reload while still offline shows the change from this device's own copy.
     Chromium only: Playwright's WebKit cuts the network below the service
     worker, so an offline navigation can't be served there even though real
     Safari serves it. */
  if (browserName === "chromium") {
    await page.reload();
    await expect(page.locator(".task.done")).toHaveCount(1);
  }

  await context.setOffline(false);
  await expect(page.locator(".sync")).toHaveText("Synced", { timeout: 20_000 });

  /* signing in elsewhere proves it reached the server */
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await signIn(page, account);
  await expect(page.locator(".task.done")).toHaveCount(1);
});

test("leftovers moved to tomorrow survive a template being stamped on it", async ({ page }) => {
  await createAccount(page, freshAccount());

  await page.getByRole("button", { name: /Chill/ }).click();
  await page.locator(".task").first().locator(".check").click();
  await page.getByRole("button", { name: "Move what's left to tomorrow" }).click();

  await page.getByRole("button", { name: "Next" }).click();
  /* the six Chill tasks that draw on a bank; the tick above was the 07:00
     review, which doesn't */
  const moved = page.locator(".task", { hasText: "moved 1×" });
  await expect(moved).toHaveCount(6);

  /* inserting a template adds around the leftovers rather than wiping them */
  await page.getByRole("button", { name: /Productive/ }).click();
  await expect(moved).toHaveCount(6);
  await expect(page.locator(".task")).toHaveCount(15);
});

test("the banks tab reports what missed days cost", async ({ page }) => {
  await createAccount(page, freshAccount());
  await tab(page, "Banks").click();

  await expect(page.locator(".driftTag")).toBeVisible();
  await expect(page.locator(".driftLede")).toContainText("starts today");
  await expect(page.locator(".bank")).toHaveCount(4);
});

test("signing out leaves the account behind, and signing back in restores it", async ({ page }) => {
  const account = freshAccount();
  await createAccount(page, account);
  await page.getByRole("button", { name: /Productive/ }).click();
  await expect(page.locator(".sync")).toHaveText("Synced");

  await tab(page, "Settings").click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "Yes, sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await signIn(page, account);
  await expect(page.locator(".task")).toHaveCount(9);
});

test("a wrong password is reported rather than swallowed", async ({ page }) => {
  const account = freshAccount();
  await createAccount(page, account);
  await tab(page, "Settings").click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "Yes, sign out" }).click();

  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page.getByRole("alert")).toContainText(/invalid/i);
});
