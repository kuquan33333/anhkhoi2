function xml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"
  }[c]));
}
export async function onRequestGet({ env }) {
  const base = "https://anhkhoi.pages.dev";
  const result = await env.DB.prepare(
    "SELECT slug,title,excerpt,published_at FROM manual_posts WHERE status='published' " +
    "ORDER BY COALESCE(published_at,created_at) DESC,id DESC LIMIT 50"
  ).all();
  const items = (result.results || []).map(post => {
    const url = base + "/bai-viet/?slug=" + encodeURIComponent(post.slug);
    const date = post.published_at ? new Date(post.published_at) : new Date();
    return "<item><title>" + xml(post.title) + "</title><link>" + xml(url) +
      "</link><guid isPermaLink=\"true\">" + xml(url) + "</guid>" +
      "<description>" + xml(post.excerpt) + "</description>" +
      "<pubDate>" + date.toUTCString() + "</pubDate></item>";
  }).join("");
  const body = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<rss version="2.0"><channel><title>Anh Khôi AI Media</title>' +
    '<link>' + base + '/</link><description>Video AI, tin nổi bật và công nghệ</description>' +
    '<language>vi</language>' + items + '</channel></rss>';
  return new Response(body, { headers: {
    "content-type":"application/rss+xml; charset=utf-8",
    "cache-control":"public, max-age=300"
  } });
}
