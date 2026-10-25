import { expect, test as base } from "@playwright/test";

export const E2E_ACCESS_PASSWORD =
  process.env.XPAT_ACCESS_PASSWORD ?? "xpat-e2e-access-password";

export const test = base.extend<{ unlocked: void }>({
  request: async ({ context }, provide) => {
    await provide(context.request);
  },
  unlocked: [
    async ({ context }, provide) => {
      const response = await context.request.post("/api/access", {
        form: { password: E2E_ACCESS_PASSWORD, next: "/" },
        maxRedirects: 0,
      });

      expect(response.status()).toBe(303);
      await provide();
    },
    { auto: true },
  ],
});

export { expect };
export type { Page } from "@playwright/test";
