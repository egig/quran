import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // GitHub Pages serves a project site under /<repo>/; the deploy workflow
  // sets BASE_PATH. Locally the site lives at /.
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
});
