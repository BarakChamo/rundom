// Adapts the WHATWG-compatible cookie store to jsdom's loose defaults.
import { CookieJar as BaseCookieJar, type CreateCookieJarOptions, type Store } from "tough-cookie";

/** Cookie jar shared by documents and their requests. Loose cookie parsing is enabled by default. */
export class CookieJar extends BaseCookieJar {
  constructor(store?: Store, options?: CreateCookieJarOptions) {
    super(store, { looseMode: true, ...options });
  }
}
