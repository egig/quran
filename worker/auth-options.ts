import type { BetterAuthOptions } from "better-auth";

/** better-auth options shared by worker/auth.ts and `scripts/auth-schema.ts`, which writes the D1 migration from them. */
export const authOptions = {
  basePath: "/api/auth",
  rateLimit: {
    enabled: true,
    // Workers isolates do not share memory: keep the counters in D1.
    storage: "database",
    customRules: { "/sign-in/magic-link": { window: 300, max: 3 } },
  },
  advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
  session: { expiresIn: 60 * 60 * 24 * 90, updateAge: 60 * 60 * 24 },
} satisfies BetterAuthOptions;
