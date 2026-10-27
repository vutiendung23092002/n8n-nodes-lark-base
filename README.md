# @vutiendung/n8n-nodes-lark-base

Community nodes cho n8n tích hợp Lark Base/Feishu: lấy tenant access token, đọc, tìm kiếm, tạo, cập nhật, xóa và Upsert bản ghi. Tìm **Lark Base (Vutiendung)** hoặc **Lark Access Token (Vutiendung)** trong danh sách node.

Mã nguồn hiện tại có thay đổi **Unreleased** về an toàn dữ liệu; version package chưa tăng và chưa publish. Kiểm thử dùng HTTP giả lập, chưa xác minh các operation mới trên tenant Lark thật. Lịch sử ở [CHANGELOG](CHANGELOG.md), chuyển đổi workflow ở [migration](docs/migration.md).

## Cài đặt và xác thực

Trên n8n self-hosted cho phép community packages, mở Settings → Community nodes → Install và nhập `@vutiendung/n8n-nodes-lark-base`. npm chỉ có bản đã được phát hành. Muốn thử Unreleased, build/cài tarball local vào thư mục community packages của chính tiến trình/container n8n rồi restart. Chưa xác minh n8n Cloud.

Tạo ứng dụng nội bộ ở [Lark](https://open.larksuite.com/app) hoặc [Feishu](https://open.feishu.cn/app), cấp scope phù hợp (`bitable:app:readonly` cho đọc, `bitable:app` cho quản lý hoặc scope chi tiết theo endpoint), phát hành/phê duyệt app và thêm app vào Base. Scope API và quyền Base là hai lớp khác nhau.

Tạo credential **Lark API (Vutiendung)**, chọn nền tảng và nhập App ID/App Secret. Type riêng là `vutiendungLarkApi`; không dùng credential Lark của package khác. Credential test xác nhận lấy token, không xác nhận quyền toàn Base.

- **Credential ứng dụng** tại Base: node tự lấy/cache token trong execution, làm mới một lần khi Lark xác nhận token không hợp lệ.
- **Token từ node trước** (mặc định): nối `Lark Access Token → Lark Base`, chọn credential tại node token. Base nhận `{{ $json.tenant_access_token }}` hoặc `{{ $('Lark Access Token').first().json.tenant_access_token }}` cho một app; không thêm Bearer. Token ngoài hết hạn cần chạy lại node cấp token.

Mỗi app có credential/node token riêng. Secret nằm trong kho credential n8n; token output có thể lưu trong execution history. Không đưa secret/token thật vào repository/workflow mẫu.

Các thao tác theo Unique Key dùng chung client/token provider và metadata loader trong một lần execute khi cùng chế độ xác thực, nền tảng và thông tin xác thực đã resolve theo item. Schema tách theo Base/Table; token khác nhau không dùng chung client/schema. Cache không tồn tại giữa các execution; metadata lỗi được bỏ khỏi cache để item sau có thể thử lại.

## Thao tác Record

| Thao tác                       | Giá trị nội bộ                                | Hành vi                                                  |
| ------------------------------ | --------------------------------------------- | -------------------------------------------------------- |
| Liệt kê / Tìm kiếm             | `list` / `search`                             | Phân trang, Limit, filter/sort/view                      |
| Lấy một bản ghi                | `get`                                         | Đọc bằng Record ID                                       |
| Tạo / Cập nhật / Xóa           | `create` / `update` / `delete`                | Ghi theo Record ID khi cần                               |
| Tạo / Cập nhật / Xóa theo lô   | `batchCreate` / `batchUpdate` / `batchDelete` | Lô tối đa 500, chạy tuần tự                              |
| Upsert                         | `upsert`                                      | 0 record → tạo, 1 → cập nhật, nhiều → lỗi                |
| Upsert theo lô                 | `batchUpsert`                                 | Preflight và lookup toàn batch trước Batch Update/Create |
| Cập nhật / Xóa theo Unique Key | `updateByUniqueKey` / `deleteByUniqueKey`     | Chỉ ghi khi tìm đúng một record                          |
| Kiểm tra khóa trùng            | `checkDuplicates`                             | Scan bảng có phân trang, không tự xóa                    |

Nhập URL `/base/...` của Lark/Feishu hoặc App Token. Chọn Table từ danh sách hoặc nhập ID, để trống ID nếu URL đã có bảng. URL Wiki cần App Token của Base gốc. URL không thay miền xác thực của credential/token.

## Upsert và Batch Upsert

Chọn **Upsert**, Base, Table, **Unique Key Field** (Text/Number từ dropdown hoặc nhập tên chính xác) và Fields:

```json
{ "Mã đơn": "A001", "Doanh thu": 100 }
```

Khóa phải có trong Fields; null/undefined/rỗng/chỉ có khoảng trắng bị từ chối. Number `0` hợp lệ; `"01"`/`1` là cùng khóa Number. Mã dài vượt độ chính xác số nguyên an toàn phải dùng Text. Text giữ nguyên hoa thường/khoảng trắng có nội dung.

Chỉ Search thành công, đủ trang và response hợp lệ mới được kết luận `not_found` để Create. Timeout, 429 hết retry, 5xx, lỗi quyền, response sai hoặc duplicate đều lỗi, không tạo. Nhiều record cùng khóa trả `unique_key`, `duplicate_count`, `record_ids`; không chọn record đầu tiên. Thành công trả bản ghi kèm `action: created/updated` và `unique_key`.

Batch Upsert nhận mảng Bản ghi:

```json
[
	{ "fields": { "Mã đơn": "A001", "Doanh thu": 100 } },
	{ "fields": { "Mã đơn": "A002", "Doanh thu": 200 } }
]
```

Khóa trùng trực tiếp bị chặn trước HTTP, kể cả giữa n8n input items cùng platform/Base/Table/cột khóa; trùng sau chuẩn hóa Number bị chặn sau metadata, trước lookup/ghi. Khác credential/token nhưng cùng resource vẫn kiểm tra trùng; Lark và Feishu là hai resource riêng dù App Token/Table ID giống nhau. Không tự giữ dòng đầu/cuối. Lookup chia nhóm OR tối đa 10 khóa, filter tối đa 16.000 byte, đọc hết trang. Lookup lỗi/duplicate hủy mọi ghi của input batch đó.

Khi toàn lookup hợp lệ, ghi Batch Update trước rồi Batch Create, lô tuần tự. Lỗi ghi dừng các lô còn lại, không rollback. Output theo thứ tự input, có `record_index` trong mảng và pairedItem trỏ về n8n item chứa mảng. Continue On Fail giữ kết quả đã xác nhận và trả error item; downstream phải tách lỗi, không dùng thiếu record_id → Create.

**Unique Key trong node KHÔNG phải unique constraint của Lark Base.** Search + Create không atomic; nhiều writer/execution cùng khóa vẫn có race condition. Serialize writer và cấp app quyền đọc toàn bảng/cột khóa: quyền nâng cao có thể che record đã tồn tại dù Search thành công. Node không xác minh được quyền đầy đủ từ response rỗng. Xem [Upsert](docs/upsert.md) và [data safety](docs/data-safety.md) trước khi dùng pipeline doanh thu/lợi nhuận.

## Tìm kiếm và dữ liệu ghi

Chọn **Tìm kiếm → Chọn điều kiện → Thêm điều kiện**: chọn cột, phép lọc, giá trị. Có AND/OR; nhiều giá trị nhập mỗi dòng một giá trị, giữ dấu phẩy. Expression mảng có thể dùng `.join('\n')`. Rỗng/không rỗng không nhập giá trị. Ý nghĩa mảng theo phép lọc/loại cột Lark, không mặc định là OR cho mọi cột.

Ô lịch dùng múi giờ workflow (`Asia/Ho_Chi_Minh` nếu dùng giờ Việt Nam); ISO có Z/offset giữ thời điểm. Có ngày tương đối. Cột ngày chỉ dùng là/lớn hơn/nhỏ hơn/rỗng/không rỗng. JSON nâng cao hỗ trợ nhóm children; sort dùng JSON như `[{"field_name":"Doanh thu","desc":true}]`. Lookup Unique Key không dùng view/filter/sort/Limit này.

Với workflow **Search → IF → Create**, không dùng điều kiện **thiếu `record_id` → Create**: error item khi Continue On Fail cũng không có `record_id`. Kiểm tra `error` trước, sau đó mới quyết định Found/Not Found từ kết quả Search thành công. Pipeline cần chống trùng nên dùng Upsert/Batch Upsert, đồng thời tuân thủ giới hạn writer và quyền đọc ở trên.

Fields nhận JSON/expression object, chỉ gửi cột được cung cấp; null xóa ô nếu API cho phép, giữ 0/false. Metadata kiểm tra tên/kiểu trước ghi. Hỗ trợ Text, Number, Select có lựa chọn tồn tại, Date, Checkbox, User theo open_id, Phone, URL, Attachment theo file_token và liên kết Record ID. Formula/Lookup/cột hệ thống không được ghi. Ngày trong Fields JSON dùng timestamp mili giây, YYYY-MM-DD theo UTC hoặc ISO có timezone.

## Retry và chạy lại workflow

| Request                            | Chính sách                                                                                               |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| GET / POST Search                  | Tối đa 5 lần với timeout, 408/5xx, 429 và mã rate limit; backoff 500/1000/2000/4000 ms + jitter 0–250 ms |
| Create / Batch Create              | UUID v4 client_token một lần cho logical request, giữ qua retry/refresh; tối đa 3 lần với lỗi tạm thời   |
| Update / Delete và batch tương ứng | Không tự retry rate limit, timeout hoặc 5xx                                                              |
| WriteConflict 1254291              | Không tự retry, kể cả Create có client_token                                                             |

Retry-After hỗ trợ giây/HTTP date, chờ tối đa 30 giây/lần và tổng 30 giây/vòng HTTP, kiểm tra ngân sách 120 giây trước retry. Mỗi lần gọi timeout 30 giây; không coi đây là hard deadline toàn execution. Refresh auth một lần có vòng HTTP riêng. Luồng cấp token có retry rate limit giới hạn riêng, không ghi record.

client_token không bảo vệ business key giữa hai execution. Mặc định chạy lại sinh UUID mới. Create đơn có ô **Client Token (UUID v4)** để dùng UUID đã lưu từ nguồn cho cùng request/payload; không dùng lại cho payload khác. Chưa xác minh thời hạn idempotency của Lark, không hứa chống lặp vĩnh viễn. Không tự bật Retry On Fail cho node ghi. Xem [giới hạn và phục hồi](docs/data-safety.md).

## Phát triển và kiểm chứng

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
npm pack
npm run test:package
```

PowerShell có thể dùng npm.cmd nếu npm.ps1 bị chặn. test:package kiểm tra tarball local; version sẽ được người duy trì tăng riêng khi phát hành, không publish tự động.

Workflow mẫu: [liệt kê](examples/list-records.workflow.json), [lấy token](examples/token-list-records.workflow.json), [lọc](examples/search-records.workflow.json), [Upsert](examples/upsert-records.workflow.json). Không chứa credential thật. Xem [kiến trúc](docs/architecture.md), [kiểm chứng](docs/verification.md), [checklist](docs/manual-test.md), [nguồn API](docs/sources.md).

Giới hạn: chưa có OAuth/store app/Wiki resolver/Auto Map/transaction; scan giữ dữ liệu trong bộ nhớ, không có snapshot khi bảng đổi đồng thời. Upsert không thay thế điều phối writer và quyền đọc toàn bảng.
