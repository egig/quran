import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  // The Worker (wrangler.jsonc) serves the site at /. `npm run dev` runs it
  // in workerd with a local D1, so /api works locally too.
  plugins: [react(), cloudflare()],
});
