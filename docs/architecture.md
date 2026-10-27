# Kiến trúc

## An toàn dữ liệu (Unreleased)

Giữ các lớp hiện tại và node version 1–3, không đổi default/định danh. `uniquePreflight.ts` kiểm tra khóa rỗng/trùng trên toàn input, sau đó chuẩn bị context/metadata/fields của operation theo khóa trước vòng ghi. Trùng trực tiếp được chặn trước HTTP; trùng canonical Number kiểm tra sau metadata nhưng trước lookup. Continue On Fail đánh dấu input lỗi, không tự chọn dòng thắng.

`uniqueKey.ts` tập trung whitelist Text/Number, canonical key, rich text đọc từ Lark và lỗi có context. `uniqueLookup.ts` trả union not_found/found/duplicate; API lỗi throw. Search chính xác theo nhóm OR tối đa 10 khóa/filter 16.000 byte, không dùng view/filter/sort/Limit của UI. Pagination strict kiểm tra schema/cursor/total, không biến response lỗi thành rỗng. `unique.operation.ts` thực hiện ghi chỉ sau lookup đã xác nhận; Batch Upsert lookup toàn input batch trước ghi, Update rồi Create tuần tự. Response ghi được kiểm tra và map theo key/ID. Lỗi ghi dừng lô còn lại, không rollback. Check Duplicates chỉ đọc đủ trang.

`retry.ts` phân loại read/write/idempotentCreate, backoff+jitter và Retry-After/budget với dependency inject để test deterministic. `createLarkClient` tự nhận diện GET/Search, Create/Batch Create và các write khác. Client cấp UUID v4 trước vòng retry/refresh, dùng cùng token khi retry Create, query ignore_consistency_check=false. Update/Delete không tự retry lỗi tạm thời; WriteConflict không tự retry. Luồng requestJson legacy cho token giữ giới hạn rate limit riêng.

Unique Key không phải unique constraint; cần quyền toàn bảng và serialize writer. Không hứa transaction, snapshot hoặc idempotency xuyên execution. Tài liệu chi tiết ở upsert.md/data-safety.md; migration và lịch sử tách khỏi README.

## Luồng token riêng từ bản 0.2.0

`nodes/LarkAccessToken/LarkAccessToken.node.ts` gọi helper `getTenantAccessToken` dùng chung với `createTenantTokenProvider`, chỉ trả token và thông tin thời hạn. Từ package 0.2.1, node token version 2 mặc định đọc credential Lark API; version 1 giữ parameter cũ để tương thích. Không sao chép App Secret hay dữ liệu input vào output. Token là dữ liệu được truyền theo workflow theo yêu cầu người dùng, có thể xuất hiện trong lịch sử chạy.

Node token version 2 không đọc getNodeParameter cho App ID/App Secret/nền tảng; các property cũ chỉ hiển thị ở version 1 bằng @version. Kho mã hóa credential do n8n quản lý. `larkApiCredentialTest` trong transport được dùng chung bởi hai node, tránh lặp logic kiểm tra. Bản vá không tự di chuyển hoặc xóa secret/history trong workflow người dùng; việc đổi version cần cấu hình credential và dọn giá trị cũ ở instance.

Lark Base hỗ trợ node version [1, 2, 3], mặc định node mới là 3. Version 1 giữ chế độ credential. Version 2/3 có lựa chọn token ngoài hoặc credential ứng dụng, dùng cùng action và transport. Chỉ có một khai báo credential với điều kiện ẩn khi authentication=tenantToken; tránh lỗi n8n 2.4.1 lấy khai báo credential đầu tiên nếu trùng tên.

`tokenAuthentication.ts` đọc parameter đúng chữ ký execute/loadOptions và tạo provider cho token ngoài. Provider không refresh: nếu transport phát hiện mã token hết hạn/không hợp lệ, thông báo cần chạy lại node token. Client token được tạo theo input item; metadata của token này không bị dùng lại cho token khác. Chế độ credential vẫn dùng client/cache metadata chung trong một lần execute.

Parameter xác thực chỉ hiện ở version 2/3 bằng @version. Kiểm thử dùng NodeHelpers thật xác minh defaults version 1 không thêm authentication=tenantToken, và credential không bắt buộc khi chọn token ngoài. Tên nội bộ Base giữ nguyên. Từ package 0.2.2, mọi node dùng credential phải chọn lại credential mới `vutiendungLarkApi`.

## Bộ lọc trực quan từ bản 0.3.0

`Filter.description.ts` định nghĩa fixedCollection nhiều điều kiện theo thứ tự cột/phép lọc/giá trị. Node Base version 3 mặc định filterMode=builder; version 1/2 không có parameter này và luôn đọc filter JSON cũ. Version 3 có thể chọn JSON nâng cao. Không trộn bộ lọc đang ẩn vào bộ lọc được chọn.

`getFilterFields` tải mọi trang metadata với đúng Base/bảng và cùng client xác thực của node. Dropdown lưu tên cột vì Search yêu cầu field_name. Có chế độ nhập tên thủ công. `buildRecordContext` là async để `buildStructuredFilter` kiểm tra metadata khi có điều kiện; loader metadata được chia sẻ với action và không dùng chéo token theo item.

Builder tạo conjunction and/or cùng conditions, chỉ cho 10 operator đang được Lark hỗ trợ. Nhiều giá trị tách theo newline, giữ dấu phẩy/khoảng trắng của dòng có nội dung; giá trị đơn hỗ trợ expression số/boolean. Empty operator gửi value=[] và bỏ tham số giá trị cũ. Ngày dùng preset hoặc normalizeDate chung với dữ liệu ghi để tạo ExactDate/timestamp; các cột DateTime/CreatedTime/LastModifiedTime có kiểm tra phép lọc riêng. Khi lỗi, node báo vị trí điều kiện và không gửi Search thiếu bộ lọc. JSON nâng cao giữ hợp đồng parser cũ, gồm một cấp children.

Từ 0.3.1, `filterDate.ts` xử lý riêng ngày của bộ lọc: dùng Luxon 3.7.2 (dependency runtime trực tiếp) và timezone từ context.getTimezone(), nhận định dạng không offset của dateTime picker với T hoặc dấu cách. So sánh thành phần ngày/giờ sau parse để không tự đẩy giờ DST không tồn tại hoặc 24:00 sang hôm sau; giờ DST bị lặp cần ISO có offset. ISO có Z/offset và timestamp số đi qua normalizeDate cũ, không áp timezone lần hai. Không nới parser ngày của Fields JSON khi ghi. Base vẫn là node version 3.

## Luồng thực thi

```text
nodes/LarkBase/v1/LarkBase.node.ts
    → buildRecordContext: đọc parameter theo từng item, parse URL/ID/JSON
    → actions/record: chọn thao tác bằng bảng handler
    → helpers/metadata: lấy và cache schema của bảng trong lần thực thi
    → normalizeFields: kiểm tra và chuẩn hóa giá trị theo schema
    → serializeFields: tạo payload chỉ chứa field được gửi
    → shared/transport: token, request, lỗi, retry
    → n8n items với pairedItem
```

## Credential và xác thực

`credentials/VutiendungLarkApi.credentials.ts` khai báo `vutiendungLarkApi`, hiển thị **Lark API (Vutiendung)**, gồm App ID, App Secret và nền tảng. Không đăng ký alias `larkApi`: registry credential của n8n không thêm scope package; tên đó thuộc schema khác của Bizflow với trường secret `appToken`. Không tự đọc fallback hoặc di chuyển dữ liệu type cũ. Kiểm tra credential đăng ký ở `methods.credentialTest` của node, tái sử dụng tenant token provider. Ngữ cảnh credential của n8n chỉ cung cấp `helpers.request`; một adapter trong transport chuyển về cùng giao diện HTTP, không lặp logic token.

`createTenantTokenProvider` lấy token qua endpoint nội bộ chính thức, cache token trong closure với thời hạn an toàn và gộp yêu cầu lấy token đồng thời. Không có cache module toàn cục, ghi token vào static data, file hay log. Thay secret giữa hai lần chạy tạo provider mới.

`TokenProvider` là hợp đồng nhỏ, có thể thay bằng user token/OAuth sau này. `LarkClient` chỉ phụ thuộc provider, không biết credential được lưu theo cách nào. Token không đi qua layer action hoặc output.

## Transport dùng chung cho các node tương lai

Các kiểu, token, lỗi, pagination và chunking đặt trong `shared/`. Base chỉ xây đường dẫn API. Khi thêm node Lark khác, có thể dùng lại HTTP/token rồi mở rộng quy tắc path có chủ đích; không cần đưa authentication vào từng operation.

HTTP dùng helper n8n, timeout 30 giây, JSON, phản hồi đầy đủ và không theo redirect. Origin chỉ đến từ hai lựa chọn nền tảng cố định. URL Base chỉ cung cấp token/bảng/view, không trở thành địa chỉ HTTP.

`requestJson` kiểm tra HTTP status và Lark code kể cả HTTP 200. Không đính kèm nguyên nhân HTTP gốc vì lỗi helper có thể chứa request body/header bí mật. Message từ Lark được che các secret/token đã biết và dạng Bearer. Lỗi n8n phía ngoài dùng NodeOperationError với itemIndex.

Retry đọc/ghi theo chính sách Unreleased ở trên; không có queue toàn cục hoặc transaction qua nhiều batch. Chính sách và giới hạn được mô tả trong README/data-safety.md để xây workflow phục hồi phù hợp.

## Các thao tác record

Mỗi operation nằm trong module riêng. `RecordContext` chứa client, đường dẫn bảng, dữ liệu đã parse, tùy chọn phân trang và callback metadata; không chứa toàn bộ ngữ cảnh n8n. Bảng `recordOperations` loại bỏ switch lớn và cho phép thử action độc lập.

List dùng lại Search với filter rỗng, vì endpoint GET List đã được SDK đánh dấu không khuyến nghị. Search gửi filter/sort/view trong body và page_token/page_size trong query. Get/Create/Update nhận `data.record`; Delete trả xác nhận `deleted`.

Node thực thi từng input item theo thứ tự. Mỗi record thành một output item, giữ metadata đọc và `pairedItem.item`. Lỗi ở một input có thể trở thành `{error}` khi bật Continue On Fail. Không sử dụng alwaysOutputData để tạo record giả khi bảng trống.

## Parser và chọn bảng

`parseBaseUrl` độc lập với UI; chỉ chấp nhận HTTPS trên các miền được hỗ trợ hoặc token chữ/số. Không resolve URL Wiki. Query thừa được bỏ qua, ID có định dạng sai bị từ chối. `buildRecordContext` ưu tiên Table đã chọn; nếu trống thì dùng bảng trong URL. View từ URL chỉ kế thừa khi bảng khớp.

Table dùng Resource Locator với `list`/`id`. `loadOptionsDependsOn: ['base']` làm mới danh sách khi Base thay đổi. `searchTables` gọi API bảng và trả tên hiển thị/ID nội bộ. Danh sách không lọc phân trang phía UI; tìm theo tên duyệt mọi trang vì API bảng không có filter tên. Lỗi tải không vô hiệu hóa chế độ ID.

## Metadata, chuẩn hóa và serialization

Ba trách nhiệm riêng:

1. `createMetadataLoader` lấy mọi trang field, cache theo đường dẫn Base/bảng trong lần execute; bỏ cache promise lỗi.
2. `normalizeFields` đối chiếu tên cột, loại và lựa chọn trong metadata. Hàm thuần, không gọi mạng và không sửa object đầu vào.
3. `serializeFields` chỉ bao `{fields}`, không tự điền cột vắng mặt.

Kiểu ghi hỗ trợ được liệt kê trong README. Lookup/Formula/cột hệ thống bị chặn trước cả null; không biến dữ liệu đọc thành dữ liệu ghi một cách mù quáng. Ngày không có múi giờ bị từ chối; ngày thuần dùng UTC. Metadata là nền cho Resource Mapper tương lai, không gắn schema bảng mẫu vào node.

## Phân trang và batch

`paginateLarkApi` nhận callback lấy một trang. Truyền cursor cho đến has_more=false, giảm kích thước trang theo Limit còn lại và từ chối cursor thiếu/lặp. Không cố suy diễn has_more từ số phần tử vì trang có thể rỗng nhưng vẫn còn cursor.

`chunkItems` tập trung giới hạn lô. Batch Create/Update/Delete dùng cùng một action factory; chuẩn hóa toàn bộ mảng trước lần ghi đầu tiên. Các lô chạy tuần tự để giảm xung đột ghi Base. Với cập nhật/xóa, kết quả được sắp theo ID đầu vào; với tạo, giữ thứ tự server.

Nếu lỗi khi dừng, thông báo chỉ rõ lô và khoảng vị trí, nhắc các lô trước có thể đã thành công. Nếu Continue On Fail, mỗi phần tử của lô lỗi có error và chỉ số, sau đó tiếp tục lô khác. Đầu vào mảng vẫn là một n8n input item nên toàn bộ kết quả trỏ về item đó.

## Cách thêm operation

1. Thêm mô tả parameter tiếng Việt trong `LarkBase.description.ts`, giữ tên nội bộ tiếng Anh.
2. Parse parameter vào context bằng helper nhỏ, không gọi HTTP tại UI.
3. Thêm action nhận RecordContext và trả IDataObject[]. Gọi client chung, dùng normalization cho mọi thao tác ghi.
4. Đăng ký handler, thêm test hành vi thực tế và cập nhật README/manual test.
5. Chạy typecheck, lint, test, build và kiểm tra nội dung gói trước khi phát hành.

## Kiểm thử và giới hạn chứng minh

Test dùng `node:test` qua tsx, không có credential thật. Có kiểm thử parser, pagination, chunking, normalization, transport, credential adapter, selector, action và execute. Test kiểm tra request/output thực tế bằng HTTP giả lập; không chứng minh scope được duyệt hoặc UI render đúng trên mọi bản n8n.

`tsconfig.test.json` kiểm tra kiểu cả test. Test import `.node.ts` rõ ràng để runtime không chọn nhầm `.node.json`. Bộ test không nằm trong tarball.

Kiểm thử loader dùng thêm runtime 2.4.1 ở devDependency. Kết nối vào/ra dùng chuỗi `main`, tránh yêu cầu enum có tên khác giữa các runtime. Peer của package được đánh dấu tùy chọn để npm không tự cài một runtime mới; host n8n cung cấp runtime khi chạy.

Sau `npm pack`, chạy `npm run test:package` để kiểm tra chính tarball. Script giải nén vào thư mục tạm, bỏ các dependency phát triển/peer giống trình cài n8n 2.4.1, thay runtime của cây module chỉ trong tiến trình kiểm thử và khởi tạo class bằng VM. Kiểm tra này phát hiện lỗi có thể bị loader che bằng thông báo Class could not be found.

Từ 0.1.3, hai entry có đường dẫn khác với bản cũ để tránh khóa require.cache của module đã được import nhưng constructor thất bại. Tên class vẫn khớp tên file, còn tên nội bộ node/credential giữ nguyên. Ngoại lệ ESLint về thư mục chỉ áp dụng entry `v1/LarkBase.node.ts`, có giải thích trong config.

`shared/runtime.ts` nạp CommonJS của `n8n-workflow` một cách lười khi gọi helper thực thi. Không dùng import runtime ở đầu cây module đăng ký metadata. Tarball test giữ entry cũ lỗi trong cache và kiểm tra entry mới vẫn nạp được, sau đó cấm require runtime để chắc metadata không phụ thuộc khởi tạo runtime.
