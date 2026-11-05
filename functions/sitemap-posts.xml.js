function xml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]));
}
export async function onRequestGet({ env }) {
  const res = await env.DB.prepare(
    "SELECT slug,COALESCE(updated_at,published_at) AS lastmod FROM manual_posts " +
    "WHERE status='published' AND COALESCE(editorial_action,'KEEP') NOT IN ('ARCHIVE','REMOVE_DUPLICATE') ORDER BY published_at DESC LIMIT 2000"
  ).all();
  const nodes = (res.results || []).map(post =>
    "<url><loc>" + xml("https://anhkhoi.pages.dev/bai-viet/?slug=" + encodeURIComponent(post.slug)) +
    "</loc><lastmod>" + xml(String(post.lastmod || "").slice(0,10)) +
    "</lastmod></url>").join("");
  return new Response('<?xml version="1.0" encoding="UTF-8"?>' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + nodes + "</urlset>",
    { headers: { "content-type":"application/xml; charset=utf-8", "cache-control":"public,max-age=300" }});
}
