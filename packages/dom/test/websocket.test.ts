// Verifies that exposing the Window interface does not initialize its transport.
import { expect, it } from "vitest";
import { createWindow } from "../src/window.js";

it("initializes the WebSocket transport on construction instead of global access", () => {
  const failure = new Error("Transport initialized");
  let calls = 0;
  const { window } = createWindow({
    markup: "",
    includeNodeLocations: false,
    createWebSocket: () => {
      calls++;
      throw failure;
    },
  });
  try {
    const Socket = window.WebSocket;
    expect(window.WebSocket).toBe(Socket);
    expect(Socket.OPEN).toBe(1);
    expect(calls).toBe(0);
    expect(() => new Socket("ws://example.test")).toThrow(failure);
    expect(calls).toBe(1);
  } finally {
    window.close();
  }
});
