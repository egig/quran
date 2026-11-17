import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { authOptions } from "./auth-options.ts";

export interface Env {
  DB: D1Database;
  EMAIL: SendEmail;
  ASSETS: Fetcher;
  /** Signs session cookies and tokens. A secret: `wrangler secret put BETTER_AUTH_SECRET`. */
  BETTER_AUTH_SECRET: string;
  /** Sender of the sign-in email; its domain must be set up for Cloudflare Email Service. */
  EMAIL_FROM: string;
}

/** better-auth for one request: email link sign-in, users and sessions in D1. */
export function createAuth(env: Env, origin: string) {
  return betterAuth({
    ...authOptions,
    database: env.DB,
    baseURL: origin,
    secret: env.BETTER_AUTH_SECRET,
    plugins: [
      magicLink({
        expiresIn: 60 * 15,
        storeToken: "hashed",
        sendMagicLink: async ({ email, url }) => {
          await env.EMAIL.send({
            from: { name: "Quran Terjemah", email: env.EMAIL_FROM },
            to: email,
            subject: "Tautan masuk Quran Terjemah",
            text: `Buka tautan ini untuk masuk (berlaku 15 menit):\n\n${url}\n\nAbaikan email ini jika Anda tidak meminta untuk masuk.`,
            html: `<p>Buka tautan ini untuk masuk (berlaku 15 menit):</p><p><a href="${escapeHtml(url)}">Masuk ke Quran Terjemah</a></p><p>Abaikan email ini jika Anda tidak meminta untuk masuk.</p>`,
          });
        },
      }),
    ],
  });
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
