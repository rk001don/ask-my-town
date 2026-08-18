import { expect, test } from "@playwright/test";

// The path a customer actually walks. These assert behaviour a person would
// notice, not implementation detail -- so they keep working through a redesign
// and fail when something real breaks.

test.describe("browsing", () => {
  test("home shows the catalogue and every tile label fits", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Need Anything/i })).toBeVisible();

    // Regression: labels used to be cut mid-word ("Pharmac & Care") because
    // the label box sized to its longest word and overflowed the tile.
    const clipped = await page.evaluate(() =>
      [...document.querySelectorAll('a[href^="/c/"] .line-clamp-2')]
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map((el) => el.textContent?.trim()),
    );
    expect(clipped).toEqual([]);
  });

  // One test per screen rather than one loop over all five: a loop shares a
  // single timeout budget with every route it visits, so a slow first compile
  // on route four fails a test that is really about route one.
  for (const path of ["/", "/explore", "/c/food", "/cart", "/activity"]) {
    test(`${path} does not scroll sideways`, async ({ page }) => {
      await page.goto(path);
      await page.waitForTimeout(400);
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      expect(overflows, `${path} scrolls horizontally`).toBe(false);
    });
  }

  test("a category page filters in place", async ({ page }) => {
    await page.goto("/c/food");
    const cards = page.locator('[id^="product-"]');
    const all = await cards.count();
    expect(all).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Veg only", exact: true }).click();
    const veg = await cards.count();
    expect(veg).toBeGreaterThan(0);
    expect(veg).toBeLessThan(all);

    // Veg and non-veg are mutually exclusive -- selecting one clears the other.
    await page.getByRole("button", { name: "Non-veg only", exact: true }).click();
    const nonVeg = await cards.count();
    expect(nonVeg).toBeGreaterThan(0);
    expect(nonVeg).not.toBe(veg);
  });

  test("tapping a card opens its detail sheet", async ({ page }) => {
    await page.goto("/c/food");
    await page.locator('[id^="product-"]').first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test.describe("cart", () => {
  test("add, increase, then empty again", async ({ page }) => {
    await page.goto("/c/food");
    const card = page.locator('[id^="product-"]').first();
    await card.getByRole("button", { name: "Add", exact: true }).click();

    await expect(card.getByLabel("Increase")).toBeVisible();
    await card.getByLabel("Increase").click();

    await page.goto("/cart");
    await expect(page.getByRole("button", { name: /Continue to delivery/i })).toBeVisible();

    await page.goto("/c/food");
    await card.getByLabel("Decrease").click();
    await card.getByLabel("Decrease").click();
    // Back to the starting state rather than a stuck zero-quantity stepper.
    await expect(card.getByRole("button", { name: "Add", exact: true })).toBeVisible();
  });

  test("a guest is offered an account without being forced into one", async ({ page }) => {
    await page.goto("/c/food");
    await page
      .locator('[id^="product-"]')
      .first()
      .getByRole("button", { name: "Add", exact: true })
      .click();
    await page.goto("/cart");

    const prompt = page.getByRole("link", { name: /faster checkout/i });
    await expect(prompt).toBeVisible();
    // It must carry the way back, or signing in loses your place.
    await expect(prompt).toHaveAttribute("href", /redirect=%2Fcart/);
    // And checkout is still reachable without signing in.
    await expect(page.getByRole("button", { name: /Continue to delivery/i })).toBeVisible();
  });
});

test.describe("checkout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/c/food");
    await page
      .locator('[id^="product-"]')
      .first()
      .getByRole("button", { name: "Add", exact: true })
      .click();
    await page.goto("/checkout");
  });

  test("refuses to submit empty, and says what is missing", async ({ page }) => {
    await page.getByRole("button", { name: /Send my ask/i }).click();
    await expect(page.getByText(/enter|required|valid/i).first()).toBeVisible();
  });

  test("pasted numbers keep their digits", async ({ page }) => {
    // Regression: maxLength truncated the raw string before the handler could
    // strip separators, so a pasted number silently lost a digit.
    const phone = page.getByPlaceholder("10-digit mobile");
    await phone.fill("+91 98765 43210");
    await expect(phone).toHaveValue("9876543210");

    const pincode = page.getByPlaceholder("6-digit pincode");
    await pincode.fill("636 701");
    await expect(pincode).toHaveValue("636701");
  });
});

test.describe("order tracking", () => {
  test("guests track by order ID, never by phone number", async ({ page }) => {
    await page.goto("/activity");
    await expect(page.getByPlaceholder(/Order ID/i)).toBeVisible();
    // Phone lookup returned a stranger's name, address and history.
    await expect(page.getByPlaceholder(/phone/i)).toHaveCount(0);
  });

  test("an unknown order ID says so plainly", async ({ page }) => {
    await page.goto("/activity");
    await page.getByPlaceholder(/Order ID/i).fill("MT-NOPE99");
    await page.getByRole("button", { name: "Track" }).click();
    await expect(
      page.getByText(/find that order|No order with that ID|couldn't/i).first(),
    ).toBeVisible();
  });
});
