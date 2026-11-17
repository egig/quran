import { createAuth } from "./auth.ts";
import type { Env } from "./auth.ts";

/**
 * The site's Worker. Static files (the page and public/data) are served by
 * the assets binding before the Worker runs; only /api/* reaches this code
 * (`run_worker_first` in wrangler.jsonc).
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/auth/")) return createAuth(env, url.origin).handler(request);
    if (url.pathname === "/api/bookmarks" || url.pathname.startsWith("/api/bookmarks/")) return bookmarks(request, env, url);
    if (url.pathname.startsWith("/api/")) return json({ error: "not found" }, 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

interface BookmarkRow {
  surah: number;
  ayah: number;
  page: number;
  createdAt: number;
}

/**
 * The signed-in reader's bookmarked ayahs.
 *   GET    /api/bookmarks              -> { bookmarks: [{ surah, ayah, page, createdAt }] }, newest first
 *   PUT    /api/bookmarks/{surah}/{ayah}  body { page }
 *   DELETE /api/bookmarks/{surah}/{ayah}
 */
async function bookmarks(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await createAuth(env, url.origin).api.getSession({ headers: request.headers });
  if (!session) return json({ error: "unauthorized" }, 401);
  const userId = session.user.id;

  if (url.pathname === "/api/bookmarks") {
    if (request.method !== "GET") return json({ error: "method not allowed" }, 405);
    const { results } = await env.DB.prepare(
      "SELECT surah, ayah, page, createdAt FROM bookmark WHERE userId = ? ORDER BY createdAt DESC",
    )
      .bind(userId)
      .all<BookmarkRow>();
    return json({ bookmarks: results });
  }

  const m = /^\/api\/bookmarks\/(\d{1,3})\/(\d{1,3})$/.exec(url.pathname);
  if (!m) return json({ error: "not found" }, 404);
  const [surah, ayah] = [Number(m[1]), Number(m[2])];
  const counts = await ayahCounts(env, url);
  if (!(surah >= 1 && surah <= counts.length && ayah >= 1 && ayah <= counts[surah - 1]))
    return json({ error: "no such ayah" }, 400);

  if (request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM bookmark WHERE userId = ? AND surah = ? AND ayah = ?").bind(userId, surah, ayah).run();
    return new Response(null, { status: 204 });
  }
  if (request.method === "PUT") {
    // Only same-origin pages may write (a cross-site form cannot send JSON).
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "expected JSON" }, 415);
    const body = (await request.json().catch(() => null)) as { page?: unknown } | null;
    const page = body?.page;
    if (typeof page !== "number" || !Number.isInteger(page) || page < 1 || page > 604)
      return json({ error: "page must be 1–604" }, 400);
    const row: BookmarkRow = { surah, ayah, page, createdAt: Date.now() };
    await env.DB.prepare(
      "INSERT INTO bookmark (userId, surah, ayah, page, createdAt) VALUES (?, ?, ?, ?, ?) " +
        "ON CONFLICT (userId, surah, ayah) DO UPDATE SET page = excluded.page",
    )
      .bind(userId, surah, ayah, page, row.createdAt)
      .run();
    return json(row);
  }
  return json({ error: "method not allowed" }, 405);
}

/** Ayah count of each surah, from the generated table of contents (one fetch per isolate). */
let counts: Promise<number[]> | null = null;
function ayahCounts(env: Env, url: URL): Promise<number[]> {
  counts ??= env.ASSETS.fetch(new URL("/data/index.json", url))
    .then((r) => (r.ok ? (r.json() as Promise<{ surahs: { ayahs: number }[] }>) : Promise.reject(new Error(`index ${r.status}`))))
    .then((d) => d.surahs.map((s) => s.ayahs));
  counts.catch(() => (counts = null));
  return counts;
}
