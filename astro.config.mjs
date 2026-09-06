import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

// Webflow Cloud sets base, assetsPrefix and the adapter at build time from the
// environment's mount path. The adapter and output mode here exist only so that
// `astro dev` and `wrangler dev` run with local D1 and KV bindings. Never set `base`.
export default defineConfig({
  output: "server",
  // Webflow Cloud serves the worker on an internal host, so the request URL never matches the
  // browser's Origin header and Astro's built-in check would refuse every form post. Admin
  // posts are protected by the token in a SameSite=Strict, HttpOnly cookie (or a Bearer header).
  security: { checkOrigin: false },
  adapter: cloudflare({ platformProxy: { enabled: true } }),
  devToolbar: { enabled: false },
});
