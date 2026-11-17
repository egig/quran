import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { authClient, toggleBookmark, useAccount, useBookmarks } from "../account.ts";
import { useRootIndex } from "../data.ts";
import { BookmarkIcon } from "./AyahMenu.tsx";

/** A same-site path to return to after signing in; anything else falls back to /. */
const safePath = (p: string | null) => (p && /^\/(?!\/)/.test(p) ? p : "/");

/**
 * /masuk: sign in with a link sent by email. No password: the link signs the
 * reader in (and creates the account on first use).
 */
export function SignIn() {
  const [params] = useSearchParams();
  const back = safePath(params.get("kembali"));
  const { user } = useAccount();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(params.get("error") ? "error" : "idle");
  const [message, setMessage] = useState(params.get("error") ? "Tautan tidak berlaku atau sudah dipakai. Minta tautan baru." : "");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState("sending");
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const { error } = await authClient.signIn.magicLink({
      email: email.trim(),
      callbackURL: `${base}${back}`,
      errorCallbackURL: `${base}/masuk?error=1&kembali=${encodeURIComponent(back)}`,
    });
    if (error) {
      setState("error");
      setMessage(error.status === 429 ? "Terlalu banyak permintaan. Coba lagi beberapa menit lagi." : "Gagal mengirim tautan. Coba lagi.");
    } else setState("sent");
  };

  if (user)
    return (
      <section className="account">
        <h1>Masuk</h1>
        <p>
          Anda sudah masuk sebagai <strong>{user.email}</strong>.
        </p>
        <p>
          <Link to={back}>Lanjutkan</Link>
        </p>
      </section>
    );

  return (
    <section className="account">
      <h1>Masuk</h1>
      {state === "sent" ? (
        <p role="status">
          Tautan masuk telah dikirim ke <strong>{email.trim()}</strong>. Buka email tersebut dan ketuk tautannya
          (berlaku 15 menit).
        </p>
      ) : (
        <form onSubmit={submit}>
          <p>Masukkan email Anda. Kami akan mengirim tautan untuk masuk, tanpa kata sandi.</p>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit" disabled={state === "sending"}>
            {state === "sending" ? "Mengirim…" : "Kirim tautan"}
          </button>
          {state === "error" && (
            <p className="error" role="alert">
              {message}
            </p>
          )}
        </form>
      )}
    </section>
  );
}

/** /tanda: the reader's bookmarked ayahs, newest first, each linking to its mushaf page. */
export function Bookmarks() {
  const { user, pending } = useAccount();
  const list = useBookmarks();
  const root = useRootIndex();
  const name = (s: number) => (root.status === "ok" ? root.data.surahs[s - 1]?.name.latin : undefined) ?? `Surah ${s}`;

  let body;
  if (pending) body = <p className="status">Memuat…</p>;
  else if (!user)
    body = (
      <p>
        <Link to="/masuk?kembali=%2Ftanda">Masuk</Link> untuk menyimpan tanda ayat.
      </p>
    );
  else if (list === null) body = <p className="status">Memuat…</p>;
  else if (!list.length)
    body = <p>Belum ada tanda. Klik kanan (atau tekan lama di ponsel) pada sebuah ayat untuk menandainya.</p>;
  else
    body = (
      <ul className="bookmarks">
        {list.map((b) => (
          <li key={`${b.surah}:${b.ayah}`}>
            <Link to={`/${b.page}`}>
              <BookmarkIcon filled />
              <span>
                {name(b.surah)} {b.surah}:{b.ayah}
              </span>
              <span className="muted">Halaman {b.page}</span>
            </Link>
            <button
              type="button"
              className="remove"
              aria-label={`Hapus tanda ${name(b.surah)} ${b.surah}:${b.ayah}`}
              onClick={() => toggleBookmark(b.surah, b.ayah, b.page).catch(() => {})}
            >
              Hapus
            </button>
          </li>
        ))}
      </ul>
    );

  return (
    <section className="account">
      <h1>Tanda ayat</h1>
      {body}
    </section>
  );
}
