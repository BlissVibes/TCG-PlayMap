/**
 * "Was this file run directly (node path/to/script.mjs), not imported?"
 *
 *   if (isMain(import.meta.url)) main();
 *
 * Every script here used `import.meta.url === \`file://${process.argv[1]}\``.
 * import.meta.url is a URL, so a space in the path is %20 there and a literal
 * space in argv; the comparison was false, and the script exited 0 having done
 * nothing and printed nothing. This checkout lives under "_Vibe Coding
 * Projects", and every Windows path (C:\..., backslashes) fails the same way.
 * pathToFileURL does the encoding Node itself uses for import.meta.url.
 */
import { pathToFileURL } from "node:url";

export function isMain(importMetaUrl, argv1 = process.argv[1]) {
  if (!argv1) return false;
  return importMetaUrl === pathToFileURL(argv1).href;
}
