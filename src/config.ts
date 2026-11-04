import type {
	ExpressiveCodeConfig,
	LicenseConfig,
	NavBarConfig,
	ProfileConfig,
	SiteConfig,
} from "./types/config";

export const siteConfig: SiteConfig = {
	title: "Anh Khôi AI Media",
	subtitle: "Video AI, tin nổi bật và công nghệ",
	lang: "vi",
	themeColor: { hue: 224, fixed: false },
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
		{ name: "Video AI", url: "/reels/" },
		{ name: "Facebook feed", url: "/facebook/" },
		{ name: "Bài viết", url: "/archive/" },
		{ name: "Giới thiệu", url: "/about/" },
		{
			name: "Facebook",
			url: "https://www.facebook.com/profile.php?id=61595505020148",
			external: true,
		},
	],
};
export const profileConfig: ProfileConfig = {
	avatar: "/assets/anhkhoi-avatar.webp",
	name: "Anh Khôi",
	bio: "Sáng tạo video AI, chia sẻ tin đáng chú ý và những điều thú vị về công nghệ.",
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
