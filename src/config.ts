import type {
	ExpressiveCodeConfig,
	LicenseConfig,
	NavBarConfig,
	ProfileConfig,
	SiteConfig,
} from "./types/config";

export const siteConfig: SiteConfig = {
	title: "Anh Khôi AI Media",
	subtitle: "Công nghệ, AI, khoa học, khám phá và sáng tạo",
	lang: "vi",
	themeColor: { hue: 250, fixed: false },
	banner: {
		enable: true,
		src: "/assets/anhkhoi-cover.webp",
		position: "center",
		credit: {
			enable: false,
			text: "Ảnh bìa Facebook Anh Khôi",
			url: "https://www.facebook.com/profile.php?id=61595505020148",
		},
	},
	toc: { enable: true, depth: 2 },
	favicon: [{ src: "/favicon-ak.png", sizes: "64x64" }],
};
export const navBarConfig: NavBarConfig = {
	links: [
		{ name: "Trang chủ", url: "/" },
		{ name: "Công nghệ & AI", url: "/chuyen-muc/cong-nghe-ai/" },
		{ name: "Khoa học & Khám phá", url: "/chuyen-muc/khoa-hoc-kham-pha/" },
		{ name: "Du lịch & Trải nghiệm", url: "/chuyen-muc/du-lich-trai-nghiem/" },
		{ name: "Bài viết", url: "/archive/" },
		{ name: "Giới thiệu", url: "/about/" },
	],
};
export const profileConfig: ProfileConfig = {
	avatar: "/assets/anhkhoi-avatar.webp",
	name: "Anh Khôi",
	bio: "Website cá nhân về công nghệ, AI, khoa học, khám phá, sáng tạo và những kiến thức hữu ích được giải thích dễ hiểu.",
	links: [
		{
			name: "Facebook",
			icon: "fa6-brands:facebook",
			url: "https://www.facebook.com/profile.php?id=61595505020148",
		},
	],
};
export const licenseConfig: LicenseConfig = {
	enable: true,
	name: "Nội dung thuộc Anh Khôi AI Media",
	url: "/about/",
};
export const expressiveCodeConfig: ExpressiveCodeConfig = {
	theme: "github-dark",
};
