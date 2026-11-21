// Exercises browser globals and the jsdom alias from inside each Vitest worker.
import { JSDOM, requestInterceptor } from "jsdom";
import { createRequire } from "node:module";
import { expect, test } from "vitest";

test("runs the packed DOM environment and preserves binary request bodies", async () => {
  expect(jsdom.constructor === JSDOM).toBe(true);
  expect(createRequire(import.meta.url)("jsdom").JSDOM === JSDOM).toBe(true);
  expect(typeof requestInterceptor).toBe("function");
  expect(typeof jsdom.serialize).toBe("function");
  const separate = new JSDOM("<p>separate</p>");
  try {
    expect(separate.window.document.body.textContent).toBe("separate");
    expect(separate.window.Node === jsdom.window.Node).toBe(false);
  } finally {
    separate.window.close();
  }
  const button = document.createElement("button");
  document.body.append(button);
  let hits = 0;
  button.addEventListener("click", () => hits++);
  button.click();
  expect(hits).toBe(1);

  const request = new Request("http://localhost/", { method: "POST", body: new Blob(["Hello!"]) });
  expect(await request.text()).toBe("Hello!");
  const data = new FormData();
  data.append("upload", new File(["payload"], "file.txt"));
  const form = new Request("http://localhost/", { method: "POST", body: data });
  expect(await (await form.formData()).get("upload").text()).toBe("payload");

  const blobURL = URL.createObjectURL(new Blob(["blob"]));
  try {
    expect(await (await fetch(blobURL)).text()).toBe("blob");
  } finally {
    URL.revokeObjectURL(blobURL);
  }
});
