import { format } from "prettier";
import * as astroPlugin from "prettier-plugin-astro";
import * as sveltePlugin from "prettier-plugin-svelte";
import { createPublishingCode } from "../../components/editor-data";

export async function formatCode(body: {
  markup: string;
  reactMarkup: string;
  css: string;
  templateMarkup?: string;
}) {
  const options = { printWidth: 100, tabWidth: 2, useTabs: false } as const;
  // The captured DOM already contains author whitespace; HTML formatting can collapse it.
  const formattedMarkup = body.markup;
  const formattedCss = body.css
    ? await format(body.css, { ...options, parser: "css" })
    : "";
  const codes = createPublishingCode(
    formattedMarkup.trim(),
    formattedCss.trim(),
    body.reactMarkup.trim(),
    body.templateMarkup?.trim(),
  );
  const [css, html5, react, astro, svelte] = await Promise.all([
    format(codes.css, { ...options, parser: "css" }),
    Promise.resolve(codes.html5),
    format(codes.react, { ...options, parser: "babel" }),
    format(codes.astro, {
      ...options,
      parser: "astro",
      plugins: [astroPlugin],
    }),
    format(codes.svelte, {
      ...options,
      parser: "svelte",
      plugins: [sveltePlugin],
    }),
  ]);

  return { codes: { css, html5, react, astro, svelte } };
}
