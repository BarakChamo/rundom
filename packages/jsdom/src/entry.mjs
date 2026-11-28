// Re-exports the CommonJS facade so import and require share constructor identity.
import api from "../dist/jsdom.cjs";

export const { JSDOM, VirtualConsole, CookieJar, toughCookie, requestInterceptor } = api;
export default api;
