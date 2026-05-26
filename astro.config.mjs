// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: cloudflare(),
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret" }),
      SUPABASE_SECRET_KEY: envField.string({ context: "server", access: "secret" }),
      SHARED_USERNAME: envField.string({ context: "server", access: "secret" }),
      SHARED_PASSWORD_HASH: envField.string({ context: "server", access: "secret" }),
      SHARED_PASSWORD_PEPPER: envField.string({ context: "server", access: "secret" }),
      SESSION_HMAC_KEY: envField.string({ context: "server", access: "secret" }),
      RESEND_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
