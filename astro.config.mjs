import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

// Webflow Cloud sets base, assetsPrefix and the adapter at build time from the
// environment's mount path. The adapter and output mode here exist only so that
// `astro dev` and `wrangler dev` run with local D1 and KV bindings. Never set `base`.
export default defineConfig({
  output: "server",
  adapter: cloudflare({ platformProxy: { enabled: true } }),
  devToolbar: { enabled: false },
});
