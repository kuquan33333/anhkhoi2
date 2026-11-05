export const editorialCategories = [
  {
    name: "Công nghệ & AI",
    slug: "cong-nghe-ai",
    description: "AI, thiết bị, robot, chip, phần mềm và những công nghệ mới được giải thích từ nguyên lý đến cách sử dụng thực tế.",
  },
  {
    name: "Khoa học & Khám phá",
    slug: "khoa-hoc-kham-pha",
    description: "Thiên văn, không gian, tự nhiên, môi trường và các nghiên cứu khoa học đáng chú ý được diễn giải dễ hiểu.",
  },
  {
    name: "Quân sự & Công nghệ quốc phòng",
    slug: "quan-su-cong-nghe-quoc-phong",
    description: "Kiến thức công khai về khí tài, cảm biến, hàng không, hải quân, UAV và lịch sử công nghệ quốc phòng; không đăng bí mật hay hướng dẫn sử dụng vũ khí.",
  },
  {
    name: "Du lịch & Trải nghiệm",
    slug: "du-lich-trai-nghiem",
    description: "Điểm đến, cẩm nang, lịch trình, di sản, văn hóa địa phương và những trải nghiệm có giá trị sử dụng lâu dài.",
  },
  {
    name: "Văn hóa & Sáng tạo",
    slug: "van-hoa-sang-tao",
    description: "Điện ảnh, nghệ thuật, di sản, nhiếp ảnh, video AI, thiết kế và văn hóa số dưới góc nhìn sáng tạo.",
  },
  {
    name: "Học tập & Kỹ năng số",
    slug: "hoc-tap-ky-nang-so",
    description: "AI trong giáo dục, STEM, kiểm chứng thông tin, an toàn Internet, quyền riêng tư và kỹ năng số thiết thực.",
  },
  {
    name: "Sức khỏe & Đời sống",
    slug: "suc-khoe-doi-song",
    description: "Kiến thức sức khỏe cộng đồng, vận động, giấc ngủ, lối sống và môi trường sống dựa trên nguồn chính thống.",
  },
  {
    name: "Thể thao",
    slug: "the-thao",
    description: "Phân tích giải đấu, câu chuyện vận động viên, chiến thuật, lịch sử và khoa học – công nghệ trong thể thao.",
  },
  {
    name: "Góc nhìn & Phân tích",
    slug: "goc-nhin-phan-tich",
    description: "Các bài nguyên bản có chiều sâu, tập trung giải thích xu hướng và dữ liệu thay vì chạy theo tin nóng.",
  },
] as const;

export type EditorialCategory = (typeof editorialCategories)[number];

export const categoryBySlug = new Map(editorialCategories.map(item => [item.slug, item]));
export const categoryByName = new Map(editorialCategories.map(item => [item.name, item]));

export function categoryUrl(name: string) {
  const item = categoryByName.get(name as EditorialCategory["name"]);
  return item ? `/chuyen-muc/${item.slug}/` : "/archive/";
}

export const legacyCategoryMap: Record<string, string> = {
  "Thời sự & Xã hội": "Sức khỏe & Đời sống",
  "Thế giới": "Khoa học & Khám phá",
  "Quân sự & Quốc phòng": "Quân sự & Công nghệ quốc phòng",
  "Pháp luật & An ninh": "Học tập & Kỹ năng số",
  "Sức khỏe & Y tế": "Sức khỏe & Đời sống",
  "Giáo dục": "Học tập & Kỹ năng số",
  "Khoa học & Thiên văn": "Khoa học & Khám phá",
  "Kinh tế & Kinh doanh": "Góc nhìn & Phân tích",
  "Đời sống & Tạp chí": "Du lịch & Trải nghiệm",
  "Văn hóa & Giải trí": "Văn hóa & Sáng tạo",
};

export function normalizeCategoryName(name: string) {
  return legacyCategoryMap[name] || name;
}
