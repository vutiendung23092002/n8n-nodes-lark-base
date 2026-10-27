# An toàn dữ liệu trong pipeline

## Ranh giới bảo đảm

Không xác định được record tồn tại hay không thì không Create. Helper lookup có union not_found/found/duplicate; lỗi API throw. NOT_FOUND chỉ đến từ Search thành công, response hợp lệ, phân trang hoàn tất và không có record cho khóa. Thiếu items/has_more, total mâu thuẫn, cursor thiếu/lặp, ID lặp, field/khóa sai đều lỗi.

**Unique Key trong node KHÔNG phải unique constraint của Lark Base.** Search + Create không atomic. Hai execution cùng Search A → 0 rồi cùng Create vẫn có thể tạo hai record. Không có Redis/Postgres/khóa phân tán trong package. Serialize mọi writer trên cùng business key, kể cả workflow khác, UI và hệ thống ngoài; tuần tự từng batch trong node không điều phối nhiều execution.

Quyền đọc đầy đủ là điều kiện bắt buộc. Quyền nâng cao có thể làm Search thành công nhưng không thấy record tồn tại. Node không xác minh được quyền đầy đủ từ response rỗng. Cấp app quyền toàn bảng/cột khóa trước khi dùng Upsert. Lookup nội bộ không dùng view giới hạn.

## Retry có phân loại

- GET và POST /records/search: tối đa 4 retry (5 request) cho mạng/timeout, HTTP 408/5xx, 429 và mã 99991400/1254290; backoff 500/1000/2000/4000 ms + jitter 0–250 ms. random/sleep/clock được inject trong test.
- Create/Batch Create: tối đa 2 retry (3 request) cho lỗi tạm thời, có client_token UUID v4 tạo trước vòng retry/refresh. Giữ nguyên body/query/token của logical request.
- Update/Delete/Batch Update/Batch Delete: không tự retry rate limit, mạng/5xx. Dù cùng values có vẻ idempotent, chưa có bảo đảm side effect như tự động hóa phía Lark an toàn để phát lại.
- Mã token không hợp lệ 99991663/99991671: refresh một lần vì Lark xác nhận lỗi xác thực, không phải timeout không rõ trạng thái. Token ngoài không tự refresh. Vòng HTTP sau refresh có budget riêng.
- WriteConflict 1254291: fail, không tự retry; serialize writer. Không suy diễn lỗi concurrency luôn an toàn để gửi lại.

Retry-After hỗ trợ giây/HTTP date, tên header không phân biệt hoa thường. Chờ ít nhất backoff+jitter và giá trị header hợp lệ. Tối đa 30 giây/lần và 30 giây tổng/vòng HTTP, kiểm tra elapsed+delay trước retry với ngân sách 120 giây. Timeout mỗi lần gọi 30 giây; không diễn giải 120 giây là hard deadline toàn execution. Luồng cấp token giữ retry rate limit có giới hạn, không ghi record.

Không log lỗi HTTP gốc vì có thể chứa headers/body bí mật. Message Lark được che token/secret đã biết. Business key/record_ids xuất hiện trong output lỗi theo yêu cầu vận hành; kiểm soát quyền xem execution history.

## Idempotency và chạy lại workflow

SDK chính thức xác nhận Create/Batch Create nhận query client_token UUID v4 để request idempotent. Client đặt ignore_consistency_check=false cho Create để không bỏ kiểm tra nhất quán của API. Đây là bảo đảm theo request do Lark thực thi, không biến lookup thành transaction/unique constraint.

Token tự sinh mới cho mỗi logical request. Retry và refresh auth cùng request giữ token cũ. Execution chạy lại mặc định sinh token mới, không bảo vệ replay tùy ý. Create đơn có Client Token cho UUID đã lưu từ nguồn; cùng token chỉ dùng cho cùng request/payload. Batch Create/Upsert không lưu token xuyên execution. Không băm business key thành token ổn định vì payload/nhóm batch có thể đổi.

Chưa xác minh thời hạn lưu client_token từ tài liệu chính thức, không hứa idempotency vĩnh viễn. Khi retry hết mà Create chưa rõ kết quả, kiểm tra Base và trạng thái nguồn trước chạy lại. Node không có nhật ký logical request bền vững hoặc cache token toàn cục.

## Partial write và phục hồi

Batch Upsert chỉ ghi sau khi lookup toàn input batch đạt. Lỗi ghi dừng lô tiếp theo; những lô xác nhận thành công giữ trong output khi Continue On Fail, lô lỗi có thể đã được ghi. Lô chưa chạy không được gắn action created/updated. Batch Create/Update/Delete cũ giữ logic lô/Continue On Fail, nhưng dùng retry mới; xem migration.

Downstream phân nhánh theo error/action đã xác nhận, không dùng thiếu record_id → Create. Không tự bật Retry On Fail của n8n cho node ghi: chạy lại cả node có thể tạo client_token khác. Dùng Text cho mã dài/số 0 đầu, cấp quyền đầy đủ, scan duplicate trước vận hành và serialize writer. Thử checklist tenant thật với timeout/429/partial write trước dùng doanh thu/lợi nhuận.

Workflow Search → IF → Create cũ vẫn được hỗ trợ. Khi bật Continue On Fail, phải kiểm tra `error` trước: error item cũng thiếu `record_id`, không phải xác nhận NOT_FOUND. Chỉ quyết định Found/Not Found sau khi Search thành công. Pipeline cần chống trùng nên dùng Upsert/Batch Upsert cùng các điều kiện về quyền đọc và điều phối writer nêu trên.

## Cache trong preflight Unique Key

Duplicate business key dựa trên resource identity gồm platform, App Token, Table ID và Unique Key Field. Khác credential/token hoặc mode không tách cùng logical table thành hai resource; khác platform thì tách. Raw check không gọi API lấy token/metadata, canonical check vẫn chuẩn hóa Number sau metadata. Scope không chứa thông tin xác thực. Nếu platform resolve cho client khác platform đã dùng trong raw scope, node dừng item đó thay vì ghi sang resource khác.

Cache client/token/schema chỉ thuộc một lần execute, tách theo mode, platform, credential reference và App ID/App Secret đã resolve hoặc token ngoài. Token/schema của authorization context này không được dùng cho context khác; schema còn tách theo Base/Table. Cache không giữ kết quả lookup, không bỏ canonical duplicate check và không thay thế kiểm tra quyền đọc toàn bảng. Metadata đang dùng là schema đã đọc trong execution; không có cơ chế theo dõi thay đổi schema/quyền giữa lúc chạy. Request metadata lỗi bị loại khỏi cache; Continue On Fail giữ error item đó, item sau có thể thử lại, không chuyển lỗi thành NOT_FOUND.
