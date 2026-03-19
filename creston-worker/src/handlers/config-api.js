/**
 * Adds a public /api/config endpoint to api.js
 * Returns non-sensitive site config for client-side theme application.
 * Add this to the handleApi function in api.js.
 */

// This is a standalone export to add to api.js
// GET /api/config → returns public theme config
export async function handlePublicConfig(env) {
  const { getSiteConfig, buildThemeCSS } = await import('../db/site.js');
  const cfg      = await getSiteConfig(env);
  const themeCSS = buildThemeCSS(cfg);

  return new Response(JSON.stringify({
    theme:         cfg.theme,
    themeCSS,
    custom_colors: cfg.custom_colors,
    font_heading:  cfg.font_heading,
    font_body:     cfg.font_body,
    font_ui:       cfg.font_ui,
    name:          cfg.name,
    tagline:       cfg.tagline,
  }), {
    headers: {
      'Content-Type':  'application/json',
      'Cache-Control': 'public, max-age=60',
      'Access-Control-Allow-Origin': '*',
    }
  });
}
