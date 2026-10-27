# Lịch sử thay đổi

## Unreleased

- Sửa false-positive duplicate preflight giữa Lark và Feishu: scope raw/canonical gồm platform + Base + Table + Unique Key Field, không phụ thuộc credential/token identity. Platform dùng parameter ở token mode, credential đã resolve ở credential mode, không gọi token/metadata trước raw check; dừng nếu platform thay đổi giữa hai pha. Giữ cache và fail-closed.
- Tối ưu preflight Unique Key: reuse client/token provider theo authorization context và metadata loader theo client trong một execution; schema tách theo Base/Table, loại bỏ promise metadata lỗi. Không dùng chéo token/platform/credential đã resolve khác nhau, không cache xuyên execution. Thêm test tải giả lập 100/500 items, cách ly xác thực và regression safety.
- Thêm Upsert, Batch Upsert, Update/Delete By Unique Key và Check Duplicates; whitelist cột khóa Text/Number, dropdown metadata và nhập tên thủ công.
- Lookup chính xác có trạng thái not_found/found/duplicate; lỗi API/permission/timeout/429/5xx/schema/cursor luôn lỗi, không dùng làm căn cứ Create. Lookup bỏ qua view/filter/sort/Limit từ UI, kiểm tra đủ trang/khóa/ID/total.
- Preflight khóa rỗng/trùng trong mảng và giữa n8n input items trước ghi; kiểm tra trùng trực tiếp trước HTTP, trùng Number chuẩn hóa sau metadata nhưng trước lookup. Batch lookup nhóm OR tối đa 10 khóa/16.000 byte; toàn batch phải đạt trước ghi.
- Batch Upsert chia Update/Create tuần tự, map response về đúng khóa/ID, giữ pairedItem và record_index; lỗi ghi dừng lô còn lại, thông báo partial write.
- Tách retry READ/WRITE, thêm backoff+jitter có thể inject trong test, Retry-After giây/HTTP date và ngân sách chờ. Create/Batch Create dùng UUID v4 client_token giữ nguyên trong retry/refresh; Create đơn nhận token đã lưu từ nguồn nếu cần.
- Thay đổi hành vi cần kiểm tra khi nâng cấp: Update/Delete và batch tương ứng không tự retry rate limit/timeout/5xx; Create có client_token có thể retry lỗi tạm thời; Search/List từ chối response thiếu items thay vì trả rỗng. WriteConflict 1254291 không tự retry. Không đổi operation/parameter/output cũ hoặc xóa support node version 1–3.
- README chỉ mô tả behavior hiện tại; migration chuyển sang docs/migration.md, thêm docs/upsert.md, docs/data-safety.md, plan và workflow mẫu. Document quyền đọc toàn bảng, race condition, replay và giới hạn client_token.
- Giữ nguyên version package; đề xuất 0.4.0 khi đủ kiểm thử tenant thật. Không publish tự động.

## 0.3.1 — 24/10/2026

- Sửa lỗi bộ lọc Ngày cụ thể từ ô lịch n8n: nhận `YYYY-MM-DDTHH:mm:ss` và `YYYY-MM-DD HH:mm:ss` không có offset, chuyển sang timestamp theo `getTimezone()` của workflow.
- Ngày chỉ có YYYY-MM-DD trong bộ lọc dùng nửa đêm của múi giờ workflow. ISO có Z/offset và timestamp số giữ nguyên thời điểm; không thay đổi quy tắc ngày của Fields JSON khi ghi dữ liệu.
- Dùng Luxon 3.7.2 cho IANA timezone và DST, khai báo dependency runtime trực tiếp để không phụ thuộc thư viện được hosting hoist. Chặn ngày sai, giờ không tồn tại hoặc giờ bị lặp khi đổi DST; trường hợp giờ bị lặp cần ISO có offset.
- Thêm kiểm thử đúng ngày trong ảnh lỗi, múi giờ Việt Nam/UTC/Tokyo, offset lẻ, DST và payload Search. Không cần đổi node version 3; chỉ cập nhật package. Không tự publish.

## 0.3.0 — 24/10/2026

- Thêm Lark Base node version 3, mặc định bộ lọc trực quan cho Tìm kiếm: chọn cột từ metadata hoặc nhập tên, chọn một trong 10 phép lọc Lark hỗ trợ, thêm điều kiện và kết hợp AND/OR.
- Giá trị có ba cách nhập: một giá trị, nhiều giá trị mỗi dòng, hoặc ngày cụ thể/ngày tương đối. Rỗng/không rỗng không hiện ô giá trị và gửi mảng rỗng đúng hợp đồng API.
- Dropdown cột tải đủ các trang metadata của đúng Base/bảng bằng credential hoặc token đã chọn. Khi chạy, kiểm tra cột tồn tại và chặn phép lọc ngày không hợp lệ; thông báo theo vị trí điều kiện.
- Giữ JSON nâng cao cho nhóm điều kiện lồng nhau; node version 1/2 đã lưu vẫn dùng JSON, không tự thay đổi kết quả lọc. Định danh credential riêng từ 0.2.2 giữ nguyên.
- Thêm workflow mẫu và kiểm thử payload, nhiều giá trị, ngày, phân trang, metadata, version và Continue On Fail. Chỉ đóng gói local; người dùng tự publish.

## 0.2.2 — 24/10/2026

- Sửa xung đột credential với n8n-nodes-bizflow: đổi tên nội bộ từ `larkApi` sang `vutiendungLarkApi`, tên hiển thị thành **Lark API (Vutiendung)**.
- Đổi entry credential thành `credentials/VutiendungLarkApi.credentials.js`; không đăng ký alias `larkApi` vì sẽ tiếp tục ghi đè schema của package khác.
- Cập nhật cả Base (mọi node version), node lấy token version 2 và dynamic selector để chỉ đọc credential mới. Không tự đọc lại credential `larkApi`.
- Cần tạo/chọn credential mới cho node của package này; không sửa/xóa credential Lark cũ của package khác. Dữ liệu credential/workflow trên server không được tự di chuyển.
- Thêm kiểm thử registry theo cả hai thứ tự nạp, định danh credential trong thực thi và tarball không chứa entry credential cũ. Xem README để khôi phục giao diện credential sau xung đột.

## 0.2.1 — 24/10/2026

- Lark Access Token mới mặc định node version 2, đọc App ID/App Secret/nền tảng từ credential Lark API, không hiển thị các giá trị này trong parameter node.
- Giữ luồng lấy token riêng rồi truyền cho Base; các node Base dùng token không cần credential.
- Giữ node token version 1 cho workflow cũ, hướng dẫn chuyển sang version 2 và xóa secret cũ khỏi workflow. Cập nhật package không tự xóa giá trị hoặc lịch sử đã tồn tại.
- Dùng chung kiểm tra credential cho node token và Base; cập nhật workflow mẫu sang token version 2, không chứa parameter secret.
- Thêm kiểm thử không đọc parameter secret ở version 2, điều kiện hiển thị/defaults và che secret credential trong lỗi API.
- Token output vẫn có thể xem/lưu trong execution theo thiết kế. Không tự publish.

## 0.2.0 — 24/10/2026

- Thêm node Lark Access Token (Vutiendung), nhận App ID/App Secret qua parameter hoặc expression, trả tenant_access_token/thời hạn/nền tảng mà không cần credential.
- Thêm Lark Base node version 2, mặc định nhận token từ node trước; không gọi credential hoặc endpoint cấp token trong chế độ này.
- Giữ node version 1 cho workflow cũ và chế độ credential tùy chọn ở version 2. Phân biệt token theo từng item khi thực thi và chọn bảng động.
- Token truyền vào hết hạn được báo rõ để chạy lại node lấy token; không thử tự refresh bằng credential khác.
- Tách helper cấp token để node mới và token provider cũ dùng chung transport, retry và lỗi an toàn.
- Thêm workflow mẫu, kiểm thử output token, bảo vệ App Secret, tương thích version/credential và metadata có điều kiện.
- Không tự publish; gói được chuẩn bị để người dùng phát hành và xác thực trên điện thoại.

## 0.1.3 — 24/10/2026

- Chuyển entry node sang `nodes/LarkBase/v1/LarkBase.node.js` và credential sang `credentials/LarkBaseApi.credentials.js`, tránh dùng lại khóa cache của các entry đã cài lỗi trước đó.
- Giữ định danh workflow `@vutiendung/n8n-nodes-lark-base.larkBase`, credential `larkApi` và tên hiển thị `Lark Base (Vutiendung)`.
- Chỉ nạp helper runtime n8n khi thực thi hoặc cần chờ retry, qua CommonJS; không khởi tạo runtime khi đăng ký metadata.
- Kiểm tra tarball với entry cũ vẫn lỗi trong cache và với việc cấm nạp runtime trong bước metadata.
- Chưa có log backend Phoai để xác nhận nguyên nhân lỗi của instance đó; bản vá xử lý trường hợp cache đã tái hiện. Không tự publish.

## 0.1.2 — 24/10/2026

- Đổi tên hiển thị và tên mặc định thành `Lark Base (Vutiendung)` để tránh trùng `Lark Base` của Bizflow trong schema có ràng buộc duy nhất trên `installed_nodes.name`.
- Giữ nguyên định danh `@vutiendung/n8n-nodes-lark-base.larkBase`; workflow và credential cũ không cần chuyển đổi vì thay tên hiển thị.
- Thêm regression test SQLite: tái hiện lỗi tên trùng rồi xác minh hai node cùng tồn tại sau khi sửa.
- Lỗi SQLite ở instance n8n 2.37.9 khác với lỗi nạp class đã báo trước đó; chưa kết luận cùng một nguyên nhân.

## 0.1.1 — 24/10/2026

- Dùng giá trị kết nối `main` thay cho hằng runtime `NodeConnectionTypes.Main`, tránh lỗi khởi tạo khi thư mục community resolve sang phiên bản dùng enum cũ.
- Đánh dấu peer `n8n-workflow` là tùy chọn để npm không tự cài runtime riêng khi cài package bên ngoài trình cài của n8n.
- Thêm kiểm thử nạp node/credential theo tên class từ tên file trên runtime 2.4.1 và hợp đồng enum cũ.
- Thêm `npm run test:package` để giải nén tarball và nạp cả cây module bằng VM với runtime của n8n 2.4.1.
- Chưa xác minh trên server của người dùng hoặc với credential Lark thật; kiểm thử loader không thay thế kiểm thử toàn bộ n8n UI.

## 0.1.0 — 24/10/2026

- Dựng MVP package `@vutiendung/n8n-nodes-lark-base`, credential ứng dụng nội bộ Lark/Feishu.
- Dùng scope `@vutiendung` vì npm từ chối tên không scope do quá giống package đã có.
- Thêm Liệt kê, Lấy một bản ghi, Tạo, Cập nhật, Xóa, Tìm kiếm và ba thao tác theo lô.
- Thêm parser Base URL, chọn bảng động kèm nhập ID, phân trang và cache metadata theo lần thực thi.
- Chuẩn hóa field theo schema; không ghi đè cột vắng mặt, từ chối field chưa hỗ trợ ghi.
- Bổ sung transport/token, lỗi tiếng Việt, che thông tin bí mật và retry có giới hạn.
- Bổ sung kiểm thử tự động, workflow mẫu, tài liệu kiến trúc và checklist kiểm thử thực tế.
- Bản MVP đầu tiên; chưa xác minh n8n Cloud, chưa thử với credential thật.
