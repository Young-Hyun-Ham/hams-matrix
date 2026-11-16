// Node 24+ server runtime for the worker. No compiler or dev dependency is required.
import { registerHooks, stripTypeScriptTypes } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const empty = "data:text/javascript,export%20%7B%7D";
registerHooks({
  resolve(specifier, context, next) {
    if (["next/headers", "next/server", "next/cache"].includes(specifier))
      return next(specifier + ".js", context);
    if (specifier === "server-only") return { url: empty, shortCircuit: true };
    if (
      specifier.startsWith("@/") ||
      (specifier.startsWith(".") && context.parentURL?.startsWith("file:"))
    ) {
      const base = specifier.startsWith("@/")
        ? resolve(root, specifier.slice(2))
        : resolve(dirname(fileURLToPath(context.parentURL)), specifier);
      const target = [base + ".ts", base + "/index.ts"].find(existsSync);
      if (target) return next(pathToFileURL(target).href, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith("file:") && url.endsWith(".ts"))
      return {
        format: "module",
        shortCircuit: true,
        source: stripTypeScriptTypes(readFileSync(fileURLToPath(url), "utf8"), {
          mode: "transform",
          sourceUrl: url,
        }),
      };
    return next(url, context);
  },
});
