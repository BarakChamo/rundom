import { appendFileSync } from "node:fs";
import { registerHooks } from "node:module";

const observed = new Set();
registerHooks({
  load(url, context, next) {
    const loaded = next(url, context);
    const relevant =
      url.endsWith("/jsdom.cjs") ||
      url.endsWith("/jsdom.js") ||
      /\/jsdom\/lib\/api\.js$|\/happy-dom\/lib\/index\.js$|\/turbo-dom\/src\/environment\/(?:vitest\.mjs|jest\.cjs)$/.test(
        url,
      );
    if (relevant && !observed.has(url)) {
      observed.add(url);
      appendFileSync(process.env.QUAL_PROVIDER_LOG, url + "\n");
    }
    return loaded;
  },
});
