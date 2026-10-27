# Kế hoạch an toàn dữ liệu — 27/10/2026

## Đánh giá trước khi sửa

Repository đang sạch trên main, nối origin đúng repository người dùng. Kiến trúc đã tách UI/context, action record, metadata/normalization, transport/token, pagination và test. Giữ các lớp này, không rewrite project hay thay định danh node/credential.

Rủi ro hiện tại: retry rate limit dùng chung cho đọc/ghi; pagination cho phép items/has_more thiếu, chưa đủ để kết luận NOT_FOUND an toàn; chưa có lookup theo khóa và kiểm tra duplicate. Continue On Fail hiện trả error ở ranh giới node, cần giữ ranh giới đó ngoài lookup. README chứa nhiều lịch sử/migration cần chuyển tài liệu riêng.

## Các bước thực hiện

1. Đối chiếu SDK/tài liệu Lark chính thức về Search OR, client_token của Create/Batch Create và write conflict; ghi nguồn và giới hạn chưa xác minh.
2. Bổ sung chính sách retry có phân loại, backoff/jitter và ngân sách chờ có thể inject để kiểm thử; cấp UUID v4 một lần cho logical Create, giữ nguyên qua token refresh/retry.
3. Helper khóa whitelist Text/Number, kiểm tra đầu vào, canonical hóa Number; lookup phân trang chặt, không biến lỗi/response thiếu thành NOT_FOUND, không dùng view giới hạn lookup.
4. Preflight toàn input của các operation theo khóa trước ghi: phát hiện khóa rỗng/trùng trước HTTP khi có thể; sau metadata kiểm tra kiểu và trùng theo khóa chuẩn hóa trước lookup/ghi. Không dùng trạng thái lỗi làm căn cứ Create.
5. Upsert/Batch Upsert: lookup toàn bộ nhóm OR nhỏ trước ghi; duplicate hoặc lookup lỗi chặn ghi cả input batch; output có action/unique_key/record_index và pairedItem. Chia batch tuần tự, dừng ghi sau lỗi batch không xác định để tránh khuếch đại lỗi.
6. Dùng helper chung cho Update/Delete By Unique Key và Check Duplicates chỉ đọc/phân trang, không tự xóa.
7. Giữ node version 1–3, parameter/operation cũ và output cũ; bổ sung UI operation và selector khóa. Không tự bump package version.
8. Viết test lỗi/side effect/retry/idempotency/pairedItem, chạy lint/typecheck/test/build/pack/test:package; review diff và sửa edge case. README mô tả bản hiện tại; migration, upsert và data safety có tài liệu riêng.

## Quy tắc quyết định

- Chỉ NOT_FOUND sau Search thành công và response hợp lệ mới được Create.
- Không chọn record đầu khi nhiều bản ghi; lookup lỗi luôn throw.
- Không coi client_token là unique constraint; không hứa exactly-once qua nhiều execution hoặc writer. Không thêm kho khóa bên ngoài.
- Không push/publish tự động. Changelog Unreleased, đề xuất 0.4.0 khi đủ kiểm thử phát hành.

## Kết quả thực hiện

Đã triển khai các bước trên, giữ version package và node cũ. 209/209 test, lint/typecheck/build/pack/test:package đạt; thử thêm tarball cài sạch với loader/Workflow n8n 2.4.1 và HTTP giả lập. Review sửa các edge case total/cursor/ID lặp, độ chính xác Number và token cũ sau refresh. Chi tiết/giới hạn bằng chứng ở verification.md; chưa kiểm tra API/tenant Lark thật, chưa commit/push/publish.
