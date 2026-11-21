// Requires actual native execution in the separately installed Rust-selected Vitest consumer.
import { expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { getParserStatistics } from "@run-dom/html-parser";
it("parses inactive documents in Rust and preserves unsupported UTF-16 through a counted fallback", () => {
  const before = getParserStatistics();
  const native = new JSDOM(
    "<!doctype html><table>outside<tr><td>cell</table><template><svg><rect/></svg></template>",
  );
  const fallback = new JSDOM("<p>\ud800 retained</p>");
  try {
    expect(native.window.document.querySelector("tbody td")?.textContent).toBe("cell");
    expect(native.window.document.body.firstChild.textContent).toBe("outside");
    expect(
      native.window.document.querySelector("template").content.querySelector("rect").namespaceURI,
    ).toBe("http://www.w3.org/2000/svg");
    expect(fallback.window.document.querySelector("p").textContent).toBe("\ud800 retained");
    const after = getParserStatistics();
    expect(after.nativeCalls).toBe(before.nativeCalls + 1);
    expect(after.fallbacks.utf16_surrogate).toBe((before.fallbacks.utf16_surrogate ?? 0) + 1);
  } finally {
    native.window.close();
    fallback.window.close();
  }
});
