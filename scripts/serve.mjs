import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root = resolve("out");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".gz": "application/octet-stream",
  ".txt": "text/plain",
};
createServer(async (req, res) => {
  try {
    let path = resolve(
      root,
      "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname),
    );
    if (path !== root && !path.startsWith(root + sep)) throw Error();
    if ((await stat(path)).isDirectory()) path = resolve(path, "index.html");
    res.setHeader(
      "Content-Type",
      mime[extname(path)] || "application/octet-stream",
    );
    res.end(await readFile(path));
  } catch {
    res.statusCode = 404;
    res.end("Not found");
  }
}).listen(3000, "127.0.0.1", () => console.log("Local: http://127.0.0.1:3000"));
