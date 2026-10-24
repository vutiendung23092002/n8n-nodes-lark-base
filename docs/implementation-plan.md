# Khảo sát và kế hoạch triển khai

## Hiện trạng ban đầu

Ngày kiểm tra: 24/10/2026. Thư mục dự án trống, chưa có Git, package, credential, node, cấu hình TypeScript, lint hay test. Không có mã cũ cần giữ lại và không có AGENTS.md áp dụng trong các thư mục cha đã kiểm tra.

Môi trường: Windows, PowerShell, Node.js 26.2.0, npm 11.13.0. PowerShell chặn `npm.ps1`; dùng `npm.cmd` giải quyết mà không thay đổi chính sách hệ thống.

## Kế hoạch

1. Đối chiếu tài liệu chính thức n8n và Lark cùng SDK chính thức khi trang tài liệu cần JavaScript.
2. Dựng package TypeScript, đăng ký node/credential và công cụ build/lint/test.
3. Viết transport chung: tenant token, lỗi an toàn, thử lại có giới hạn, phân trang.
4. Viết parser Base URL, chọn bảng động và cache metadata trong từng lần thực thi.
5. Triển khai sáu thao tác record; thêm ba thao tác theo lô bằng helper dùng chung.
6. Tách nhận JSON, chuẩn hóa theo schema và tạo payload; không gửi field vắng mặt.
7. Kiểm thử logic thuần, transport và execute bằng HTTP giả lập; sửa lỗi lint/build/typecheck.
8. Viết README, kiến trúc, nguồn tham khảo, workflow mẫu và checklist thử trên Lark thật.

## Điều chỉnh sau khi kiểm tra thực tế

- `@n8n/create-node@0.53.2` và `@n8n/node-cli@0.53.4` được kiểm tra qua npm. Chuỗi dependency mới kéo `isolated-vm`; cài đặt trên Node.js 26/Windows thất bại khi phải biên dịch native và không có Python.
- Chọn `@n8n/node-cli@0.18.0` và `n8n-workflow@2.10.0` để cài và kiểm thử trên máy hiện tại, không bỏ qua install script. Tooling vẫn dùng các lệnh chính thức `n8n-node build`, `lint`, `dev`.
- Ghim bản vá cùng nhánh cho handlebars, lodash, form-data và minimatch qua `overrides`. Không ép zod 3 sang zod 4 vì thay đổi API lớn. Kết quả audit còn lại được ghi trong tài liệu kiểm chứng.
- Tắt chế độ `n8n.strict` vì CLI bắt buộc cấu hình ESLint nguyên bản; dự án cần ngoại lệ câu chữ tiếng Việt và import trình chạy test chỉ trong thư mục tests. Các quy tắc code và hạn chế runtime vẫn được giữ.
- List gọi Search API hiện hành vì SDK chính thức đánh dấu GET List cũ là không khuyến nghị.
- Batch dùng tối đa 500 cho cả hai nền tảng. SDK Feishu mô tả Batch Create tới 1.000; mức 500 giữ tương thích với tài liệu Lark và Batch Delete, có thể chọn kích thước nhỏ hơn trong UI.
- Upsert chưa triển khai: cần quyết định về khóa trùng, cạnh tranh giữa workflow và tính nguyên tử; không gắn nhãn upsert cho chuỗi tìm rồi ghi chưa bảo đảm duy nhất.

Các bước triển khai được thực hiện ngay sau khảo sát; không yêu cầu xác nhận kế hoạch.
