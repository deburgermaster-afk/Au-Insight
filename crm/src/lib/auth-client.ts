"use client";
import { organizationClient, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [
    organizationClient(),
    // After a correct password, people with two-factor on finish signing in on /two-factor.
    twoFactorClient({
      onTwoFactorRedirect() {
        const next = new URLSearchParams(window.location.search).get("next");
        window.location.href = `/two-factor${next ? `?next=${encodeURIComponent(next)}` : ""}`;
      },
    }),
  ],
});
