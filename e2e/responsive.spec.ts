import { expect, test } from "@playwright/test";

/* Nothing may run off the side of the screen, at any width from a small phone
   up. The day strip is the usual culprit, since it sizes itself from the length
   of the plan. */

const WIDTHS = [320, 360, 390, 430, 560, 768, 1100];
const TABS = ["Today", "Banks", "Settings"];

test("no screen overflows sideways, from a small phone upwards", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account instead" }).click();
  await page.getByLabel("Email").fill(`responsive-${Date.now()}@example.test`);
  await page.getByLabel("Password").fill("study-hard-2026");
  await page.getByRole("button", { name: "Create account" }).click();

  /* a full day gives the widest rows something to work with */
  await page.getByRole("button", { name: /Productive/ }).click();
  await expect(page.locator(".task")).toHaveCount(9);

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of TABS) {
      await page.getByRole("navigation").getByRole("button", { name }).click();
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        const past = [...document.querySelectorAll<HTMLElement>("body *")]
          .filter((el) => el.getBoundingClientRect().right > doc.clientWidth + 1)
          .map((el) => `${el.className || el.tagName} ends at ${Math.round(el.getBoundingClientRect().right)}`);
        return { scrolls: doc.scrollWidth > doc.clientWidth, past: past.slice(0, 5) };
      });
      expect(overflow, `${name} at ${width}px`).toEqual({ scrolls: false, past: [] });
    }
  }
});

test("the day strip keeps every cell the same size", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account instead" }).click();
  await page.getByLabel("Email").fill(`strip-${Date.now()}@example.test`);
  await page.getByLabel("Password").fill("study-hard-2026");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".cell")).toHaveCount(75);

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    const sizes = await page.evaluate(() =>
      [...document.querySelectorAll(".cell")].map((el) => {
        const r = el.getBoundingClientRect();
        return `${r.width.toFixed(2)}x${r.height.toFixed(2)}`;
      }),
    );
    expect(new Set(sizes), `cell sizes at ${width}px`).toHaveProperty("size", 1);
  }
});
