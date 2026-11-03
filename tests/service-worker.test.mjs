import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
const source = readFileSync(
  new URL("../public/sw.js", import.meta.url),
  "utf8",
);
function setup({ put, fetch, match = async () => undefined }) {
  const handlers = {};
  runInNewContext(source, {
    self: {
      location: { origin: "https://local.test" },
      addEventListener: (k, fn) => {
        handlers[k] = fn;
      },
      skipWaiting() {},
      clients: { claim() {} },
    },
    caches: { open: async () => ({ put, match }) },
    URL,
    fetch,
  });
  return (mode) => {
    let response, lifetime;
    handlers.fetch({
      request: {
        method: "GET",
        url: "https://local.test/vendor/reader.js",
        mode,
      },
      respondWith: (p) => {
        response = p;
      },
      waitUntil: (p) => {
        lifetime = p;
      },
    });
    return { response, lifetime };
  };
}
describe("offline cache delivery", () => {
  it.each(["navigate", "same-origin"])(
    "delivers %s responses before slow or rejected cache writes",
    async (mode) => {
      let rejectWrite;
      const storage = new Promise((_, reject) => {
        rejectWrite = reject;
      });
      const network = {
        ok: true,
        clone() {
          return this;
        },
      };
      const request = setup({ put: () => storage, fetch: async () => network })(
        mode,
      );
      const result = await Promise.race([
        request.response,
        new Promise((resolve) => setTimeout(() => resolve("blocked"), 50)),
      ]);
      expect(result).toBe(network);
      rejectWrite(new Error("Storage full"));
      await expect(request.lifetime).resolves.toBeDefined();
    },
  );
  it("serves cached assets and navigations offline", async () => {
    const cached = { ok: true };
    const request = setup({
      put() {
        throw Error("unexpected write");
      },
      fetch: async () => {
        throw Error("Offline");
      },
      match: async () => cached,
    });
    await expect(request("same-origin").response).resolves.toBe(cached);
    await expect(request("navigate").response).resolves.toBe(cached);
  });
});
