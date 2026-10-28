# Kiểm thử thủ công với n8n và Lark thật

Chưa thực hiện checklist này trong phiên phát triển vì không có ứng dụng/Base và credential thật. Dùng Base thử nghiệm có thể xóa dữ liệu; ghi lại phiên bản n8n, Node.js, nền tảng và thời điểm kiểm thử.

## Chuẩn bị

- [ ] Chọn phiên bản n8n self-hosted và Node.js tương thích; cài tarball local hoặc chạy `npm run dev`.
- [ ] Xác nhận node **Lark Base (Vutiendung)** và credential **Lark API (Vutiendung)** xuất hiện sau khi n8n nạp package.
- [ ] Khi cài cùng Bizflow, credential **Lark API** cũ vẫn có App ID/App Token; credential **Lark API (Vutiendung)** riêng có App ID/App Secret/nền tảng. Kiểm tra sau khi n8n restart để loại bỏ registry cũ.
- [ ] Không lưu/xóa credential cũ khi form đang bị ghi đè. Với node Vutiendung đã lưu trước 0.2.2, tạo/chọn credential mới; node của package khác giữ credential cũ và chạy thử lại.
- [ ] Nếu đã cài Bizflow hoặc node khác tên Lark Base, dùng bản 0.1.2 trở lên; kiểm tra không còn lỗi UNIQUE trên installed_nodes.name và cả hai node cùng tồn tại.
- [ ] Với n8n 2.4.1, dùng package từ 0.1.1. Nếu lần cài 0.1.0 đã thất bại, thử cài lại 0.1.1; nếu vẫn báo Class could not be found, lấy stack trace backend và đường dẫn n8n-workflow thực tế trước khi thay dependency của server.
- [ ] Nếu đã thử 0.1.0–0.1.2 và không có quyền restart, thử 0.1.3 sau khi người duy trì publish: entry mới tránh cache của entry cũ. Nếu vẫn lỗi, lấy log backend; không kết luận do cache từ một toast tổng quát.
- [ ] Tạo Custom App trong đúng tenant Lark/Feishu; lấy App ID và App Secret, chỉ lưu trong credential n8n.
- [ ] Cấp scope đọc `bitable:app:readonly` hoặc quản lý `bitable:app` phù hợp; phát hành/phê duyệt app.
- [ ] Tạo Base thử nghiệm với hai bảng. Bảng đầu có cột Text `Tên`, Number `Số lượng`, Checkbox `Đã xử lý`, Date `Ngày`, Single Select `Trạng thái` có lựa chọn `Mới`, Multi Select `Nhãn` có lựa chọn `A`, `B`.
- [ ] Thêm một cột Text `Giữ nguyên` có dữ liệu để kiểm tra Update không ghi đè.
- [ ] Thêm app vào Base qua Add applications và cấp quyền sửa. Nếu bật quyền nâng cao, gán vai trò đủ quyền đọc/ghi bảng và cột cần thử.
- [ ] Chuẩn bị URL Base có `table` và `view`; thêm ít nhất hai record, tạo thêm đủ 501 record nếu muốn kiểm tra phân trang thật.

## Credential và quyền

- [ ] Import `examples/token-list-records.workflow.json`, tạo/chọn credential Lark API (Vutiendung) tại Lark Access Token version 2, nhập Base thật vào node Base; không chọn credential trong Base.
- [ ] Node token version 2 không có ô App Secret để chuyển expression; export workflow chỉ có tham chiếu credential, không có secret trong parameter.
- [ ] Với node token version 1 đã lưu, thêm lại node version 2 hoặc đổi version, chọn credential, xóa node/parameter secret cũ rồi lưu. Kiểm tra history/version cũ theo quyền quản trị; cập nhật package không tự tẩy dữ liệu đã lưu.
- [ ] Chạy node token: output có tenant_access_token, expire, expires_at, token_type và platform, không có App Secret hoặc input gốc.
- [ ] Chạy Base node version 2 với `{{ $json.tenant_access_token }}`: không hiện yêu cầu chọn credential, List/Create/Update hoạt động theo scope/quyền app.
- [ ] Chọn bảng từ danh sách sau khi node token chạy; trước khi chạy, thử chế độ Table ID để tránh phụ thuộc preview token.
- [ ] Dùng token từ HTTP Request hiện có thay node token mới; gọi Base được mà không cần App ID/App Secret trong Base.
- [ ] Thêm Base thứ hai sau Base đầu: dùng `{{ $('Lark Access Token').first().json.tenant_access_token }}` cho một app, xác nhận không phụ thuộc token trong output record.
- [ ] Token hết hạn/không hợp lệ báo cần chạy lại node lấy token; không tự gọi credential khác. Token sai không xuất hiện lại trong error.
- [ ] Workflow cũ với Base typeVersion 1 vẫn dùng chế độ credential; sau nâng package 0.2.2 cần chọn lại Lark API (Vutiendung). Base version 2 chọn Credential ứng dụng vẫn hoạt động và tự refresh như trước.
- [ ] Đúng App ID/Secret/nền tảng: kiểm tra credential thành công và giải thích rằng quyền Base chưa được xác nhận.
- [ ] Secret sai: thông báo tiếng Việt có ngữ cảnh xác thực, không hiển thị lại Secret/token.
- [ ] Chọn sai nền tảng: không chuyển endpoint tự động theo URL Base; hiển thị lỗi xác thực rõ ràng.
- [ ] Credential đúng nhưng chưa cấp scope: chạy List báo lỗi có mã/thông báo Lark; cấp scope và phát hành lại rồi chạy thành công.
- [ ] Có scope nhưng bỏ quyền app khỏi Base: báo lỗi truy cập hoặc kết quả bị giới hạn theo quyền; cấp lại quyền rồi đối chiếu.
- [ ] Thử quyền nâng cao: số record/cột trả về phải khớp quyền ứng dụng, không chỉ quyền người đang mở trình duyệt.

## Liệt kê và chọn bảng

- [ ] Import `examples/list-records.workflow.json`, chọn credential, thay URL và chọn bảng thật.
- [ ] Chạy Manual Trigger → Lark Base, Record → Liệt kê; mỗi record thành một item riêng có `record_id` và `fields`.
- [ ] URL có bảng/view: chuyển Table sang Nhập ID, để trống; node dùng đúng bảng/view của URL.
- [ ] Base chỉ có App Token: chọn bảng từ danh sách theo tên.
- [ ] Gõ tìm tên bảng, thử tên trên trang sau nếu Base có nhiều bảng; ID được lưu đúng trong workflow.
- [ ] Đổi Base: danh sách bảng được tải lại, chọn lại bảng thích hợp.
- [ ] Mô phỏng danh sách tải lỗi hoặc thiếu quyền liệt kê bảng: chuyển Nhập ID; các thao tác vẫn gọi được nếu app có quyền dữ liệu tương ứng.
- [ ] Trả về tất cả tắt, Giới hạn 1: đúng một item.
- [ ] Có hơn 500 record, Giới hạn 501: đúng 501 item, không yêu cầu page token thủ công.
- [ ] Trả về tất cả bật: số lượng khớp Base/view mà app có quyền đọc.
- [ ] Bảng trống: không sinh record rỗng giả.
- [ ] URL sai miền, URL thiếu token, ID sai định dạng và URL Wiki: nhận lỗi tiếng Việt phù hợp.
- [ ] Chọn bảng khác với bảng trong URL: không dùng view của bảng cũ; có thể đặt View mới trong Tùy chọn.

## Bộ lọc trực quan (package 0.3.0, node version 3)

- [ ] Thêm node Base mới, xác nhận version 3, thao tác Tìm kiếm mặc định hiện Chọn điều kiện. Version 1/2 đã lưu vẫn hiện JSON.
- [ ] Import `examples/search-records.workflow.json`, cấu hình credential ở node token và thay Base/bảng/cột/giá trị thật; chạy token rồi chạy Search.
- [ ] Chọn cột từ dropdown, đổi bảng/Base/credential/token rồi kiểm tra danh sách cột tải lại đúng bảng và quyền mới. Kiểm tra với nhiều trang metadata nếu có.
- [ ] Thử nhập tên thủ công, expression tên cột và tên cột không tồn tại; trường hợp sai phải báo vị trí điều kiện, không tìm toàn bảng.
- [ ] Thử 10 phép lọc trên loại cột Lark hỗ trợ; so sánh kết quả với giao diện Lark.
- [ ] Nhiều điều kiện: đổi AND/OR, kiểm tra các trang Search vẫn dùng cùng bộ lọc. Không có điều kiện thì lấy dữ liệu không lọc.
- [ ] Nhiều giá trị mỗi dòng: thử CRLF, dòng trắng, dấu phẩy trong giá trị, expression `.join('\n')`. Kiểm tra mảng nhiều lựa chọn theo quy tắc Lark.
- [ ] Rỗng/không rỗng: ô giá trị được ẩn, giá trị cũ không ảnh hưởng kết quả.
- [ ] Cột Text: Chứa `bù đơn\nthiếu\nsai` phải khớp ít nhất một từ; Không chứa phải loại trừ cả ba từ. Thêm một dòng điều kiện khác, đổi AND/OR và so với các điều kiện đơn tương đương. Kiểm tra Phone/URL, Multi Select và mọi trang Search; đối chiếu trực tiếp trên tenant thật.
- [ ] Cột ngày: chọn ngày cụ thể có múi giờ, hôm nay/hôm qua/ngày mai và tuần; thử phép không hỗ trợ để xác nhận báo lỗi trước Search.
- [ ] Với package 0.3.1, đặt timezone workflow Asia/Ho_Chi_Minh, chọn 2026-01-02 00:00:00 bằng ô lịch (không expression) và chạy Search thành công; so sánh kết quả với ISO 2026-01-02T00:00:00+07:00 qua expression.
- [ ] Đổi timezone workflow sang UTC, kiểm tra cùng giờ không offset đổi thành thời điểm UTC; giá trị có Z/+07:00 vẫn giữ nguyên thời điểm. Không cần đổi node version.
- [ ] JSON nâng cao: thử children kết hợp nhóm AND/OR; đổi qua lại hai chế độ để xác nhận chỉ bộ lọc đang chọn được áp dụng.
- [ ] Nâng node version 2 có JSON sang version 3, chọn JSON nâng cao và đối chiếu kết quả cũ. Không sửa version hàng loạt trước khi kiểm tra từng workflow.

## Create, Get, Update và Delete

- [ ] Create bằng JSON `{"Tên":"An","Số lượng":"3","Đã xử lý":false,"Ngày":"2026-10-24","Trạng thái":"Mới","Nhãn":["A","B"]}` tạo đúng dữ liệu và trả Record ID.
- [ ] Create bằng expression trả object từ item đầu vào; kiểm tra số/boolean được giữ đúng kiểu.
- [ ] Get theo Record ID vừa tạo trả record và fields đúng.
- [ ] Update chỉ `{"Tên":"Tên mới"}`; cột Giữ nguyên và mọi cột không gửi vẫn giữ giá trị.
- [ ] Update `{"Tên":null}` xóa ô nếu cột không bắt buộc; kiểm tra `0`, `false` không bị bỏ qua.
- [ ] Date `2026-10-24T12:00:00+07:00` lưu đúng thời điểm, lưu ý múi giờ hiển thị của Base.
- [ ] Ngày không tồn tại hoặc ngày giờ không múi giờ bị từ chối trước khi ghi.
- [ ] Field không tồn tại, Number sai, Checkbox sai, Select chưa tồn tại và Formula có trong payload đều báo lỗi rõ ràng.
- [ ] Nếu dùng Person, thử `open_id` thực; Attachment thử `file_token` đã có quyền; không nhập tên người/URL tải tệp thay ID/token.
- [ ] Delete theo ID vừa tạo trả `deleted:true`; Get lại record đã xóa báo không tìm thấy theo phản hồi API.
- [ ] Record ID sai cú pháp bị chặn trước HTTP; ID đúng cú pháp nhưng không tồn tại báo mã/thông báo API có ngữ cảnh.

## Search

- [ ] Điều kiện `Tên is ["An"]` trả đúng record mong đợi.
- [ ] Sắp xếp theo cột tăng/giảm dần; thử kết hợp bộ lọc với View và đối chiếu hành vi API thực.
- [ ] Limit và Return All hoạt động khi bộ lọc trả hơn một trang.
- [ ] Filter JSON sai, value không phải mảng chuỗi hoặc operator không hợp lệ bị từ chối rõ ràng.
- [ ] Với ngày/người/checkbox, kiểm tra giá trị filter theo tài liệu Lark Search; node không dùng phép chuyển đổi của payload ghi cho bộ lọc.

## Theo lô và Continue On Fail

- [ ] Batch Create 5 record với kích thước lô 2: tạo đủ năm record qua ba request.
- [ ] Batch Update các ID trên, chỉ thay một cột; xác minh cột khác giữ nguyên và đầu ra ghép đủ.
- [ ] Batch Delete các ID trên: nhận trạng thái xóa cho từng record.
- [ ] Một field sai ở phần tử cuối: toàn bộ mảng bị từ chối trước request ghi đầu tiên.
- [ ] Dùng một Record ID không tồn tại ở lô giữa: kiểm tra thông báo chỉ rõ lô/vị trí; các lô đã thành công không bị hoàn tác.
- [ ] Bật On Error → Continue (using regular output), chạy lại trên bộ dữ liệu thử riêng: từng phần tử của lô lỗi có error/chỉ số; lô sau tiếp tục.
- [ ] Dùng hai n8n input items: output có liên kết đúng item tương ứng; không trộn Base/bảng/field giữa hai item.
- [ ] Khi mạng bị ngắt trong thao tác tạo, kiểm tra Base trước khi chạy lại: node không tự gửi lại một Create có trạng thái không xác định.

## An toàn dữ liệu và Unique Key (Unreleased)

- [ ] App có quyền thấy toàn bảng/cột khóa. Dừng writer song song trong lúc thử; không dùng kết quả app bị hạn chế quyền làm bằng chứng không có record.
- [ ] Import examples/upsert-records.workflow.json, chọn credential và Base thử nghiệm; tạo cột Text Mã đơn/Number Doanh thu. Upsert khóa mới tạo, chạy lại cập nhật cùng record_id.
- [ ] Tạo sẵn hai record cùng khóa, Upsert báo duplicate_count/record_ids, không ghi; thử duplicate nằm trên trang sau.
- [ ] Khóa null/rỗng/space và trùng input mảng/nhiều n8n items không được ghi. Number 0 hợp lệ; 01/1 trên Number bị coi trùng. Mã dài dùng Text.
- [ ] Bật Continue On Fail, mô phỏng lỗi lookup 403/429/timeout/trang sau; output là error item, không có Create/Update.
- [ ] Batch mixed đúng thứ tự output/pairedItem/record_index; lỗi một lookup hủy ghi toàn input batch; lỗi ghi dừng lô còn lại, kết quả trước đó có thể đã tồn tại.
- [ ] Update/Delete theo khóa: 0 record lỗi, 1 ghi đúng ID, nhiều lỗi. Check Duplicates đọc hết trang, không tự xóa.
- [ ] Quan sát request thử nghiệm (không log secret): Create/Batch Create có UUID v4 client_token, retry cùng request giữ token cũ; Update/Delete lỗi không tự retry.
- [ ] Node version 1/2/3 và các operation cũ vẫn chạy; đối chiếu timing/retry mới theo docs/migration.md.

## Hoàn tất

- [ ] Ghi kết quả đạt/chưa đạt, phiên bản n8n/Node.js, nền tảng, scope và cấu hình quyền nâng cao đã thử.
- [ ] Xóa dữ liệu thử và thu hồi credential thử nếu không còn cần.
- [ ] Chỉ phát hành sau khi các mục cốt lõi List/Create/Update/Get/Delete/Search đạt trên tenant thật.
- [ ] Trước phát hành, chốt người duy trì, repository/homepage và kiểm tra tên package trên npm. Không đưa credential/token vào báo cáo lỗi hoặc workflow export.
