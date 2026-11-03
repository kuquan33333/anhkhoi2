# Anh Khôi AI Media — Fuwari / Astro

Website giới thiệu Anh Khôi: video AI, Facebook Reels, tin đáng chú ý và công nghệ. Xây dựng trên mã nguồn [Fuwari](https://github.com/saicaca/fuwari) (MIT); giữ nguyên giấy phép gốc.

## Ngôn ngữ / Languages

- **Tiếng Việt mặc định:** giao diện, giới thiệu và nội dung mới được biên tập tự nhiên bằng tiếng Việt.
- **English:** nút VI / EN trên thanh điều hướng. Lựa chọn được giữ trong trình duyệt. Các bài viết mới có bản tiếng Anh được biên tập riêng, không phụ thuộc dịch máy lúc xem trang.
- Các bài demo gốc của Fuwari đã được chuyển sang bản nháp và không hiện trên trang production.

## Ảnh & Facebook

- `public/assets/anhkhoi-cover.webp` và `public/assets/anhkhoi-avatar.webp` được cắt từ **ảnh chụp Facebook do chủ website cung cấp**. Đây không phải file gốc độ phân giải cao. Nên thay bằng ảnh nguyên bản nếu muốn rõ nét trên màn hình lớn.
- Facebook: https://www.facebook.com/profile.php?id=61595505020148
- Thư viện tại `/reels/`. Người xem bấm Phát Reel mới tải trình phát Facebook. Nếu Facebook chặn nhúng, vẫn có link mở trực tiếp.
- Một URL Reel từ ảnh Facebook đã cung cấp được đưa vào demo. Chưa xác nhận nội dung và quyền nhúng của video.

## Chạy cục bộ

Node.js 22, pnpm 9.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
pnpm check
pnpm build
```

- Framework: Astro 5 + Tailwind CSS + Svelte
- Cấu hình thương hiệu: `src/config.ts`
- Bài viết song ngữ: `src/content/posts/`
- Ngôn ngữ: `src/i18n/languages/vi.ts`, `en.ts`, thành phần nút VI/EN
- Output tĩnh: `dist/` (Cloudflare Pages)

## Cloudflare Pages

- URL mục tiêu: https://anhkhoi.pages.dev
- Build command: `pnpm build`
- Output: `dist`
- Node: 22; pnpm: 9
- Trang `anhkhoi.pages.dev` trước đây kết nối repo `kuquan33333/anhkhoi`. Chỉ chuyển nguồn sang `kuquan33333/anhkhoi2` sau khi bản mới build thành công.

## Chất lượng nội dung

- Không tự tạo số người theo dõi, lượt xem hoặc khẳng định tin hot chưa kiểm chứng.
- Ảnh hiện là bản cắt từ ảnh chụp Facebook: chất lượng chỉ đủ tạm cho giao diện, không thể so với ảnh gốc.
- Thêm Reels bằng URL công khai trong `src/pages/reels.astro`.
- Bản này vẫn là blog tĩnh; đăng bài bằng Markdown và build lại, chưa có CMS cho người không biết mã nguồn.
