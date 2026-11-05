import type { APIRoute } from "astro";

const robotsTxt = `
User-agent: *
Disallow: /_astro/\nDisallow: /admin\nDisallow: /api/admin/

Sitemap: ${new URL("sitemap-index.xml", import.meta.env.SITE).href}
Sitemap: ${new URL("sitemap-posts.xml", import.meta.env.SITE).href}
`.trim();

export const GET: APIRoute = () => {
	return new Response(robotsTxt, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
		},
	});
};
