# @vutiendung/n8n-nodes-lark-base

Community Node kết nối n8n với Lark Base, hỗ trợ cả Lark và Feishu. Người dùng có thể dán URL Base, chọn bảng theo tên, đọc mỗi bản ghi thành một n8n item và ghi dữ liệu theo cấu trúc cột của bảng.

Trong danh sách node, tìm **Lark Base (Vutiendung)**. Từ bản 0.1.2, tên hiển thị có hậu tố để tránh trùng node Lark Base của package khác trên instance dùng schema có khóa duy nhất theo tên. Định danh workflow vẫn là `@vutiendung/n8n-nodes-lark-base.larkBase`.

Đây là MVP đã có kiểm thử tự động bằng HTTP giả lập, chưa kiểm thử bằng credential Lark thật. Package chưa được xác minh để sử dụng trên n8n Cloud.

## Lấy token riêng rồi truyền cho các node Base

Từ bản 0.2.0 có node **Lark Access Token (Vutiendung)**. Luồng mới không cần tạo credential App ID/App Secret trong từng node Base:

```text
Manual Trigger → Lark Access Token → Lark Base (Vutiendung)
```

1. Thêm **Lark Access Token** phiên bản node 2, tạo/chọn credential **Lark API (Vutiendung)** một lần; nhập nền tảng, **App ID**, **App Secret** trong credential. Chạy node để lấy token. Node mới không có parameter App Secret.
2. Thêm **Lark Base (Vutiendung)** phiên bản node 2; **Xác thực** mặc định là **Token từ node trước**.
3. Trong **Tenant Access Token**, dùng `{{ $json.tenant_access_token }}` nếu nối trực tiếp sau node lấy token. Không thêm tiền tố Bearer.
4. Chọn cùng nền tảng, nhập Base và chọn bảng. Nếu chưa chạy node lấy token, danh sách bảng có thể chưa tải được; chạy node token trước hoặc nhập Table ID.
5. Với nhiều node Base liên tiếp dùng chung một app, tham chiếu node nguồn bằng `{{ $('Lark Access Token').first().json.tenant_access_token }}` vì output record của Base không tự giữ token. Với nhiều app/token theo item, dùng item linking thích hợp thay vì cố định first().

Output của node lấy token có `tenant_access_token`, `expire` (giây), `expires_at` (timestamp mili giây), `token_type: "Bearer"`, `platform`. Output không sao chép App ID/App Secret hay input. Mỗi input item tạo một output tương ứng. Token lấy từ HTTP Request hiện có cũng dùng được trong ô token của Base.

Từ package 0.2.1, node lấy token mới mặc định là node version 2, dùng kho credential mã hóa của n8n. App Secret không nằm trong parameter/expression của node mới. Chỉ node lấy token cần chọn credential; các node Base vẫn dùng token được truyền vào.

Node token version 1 cũ vẫn giữ parameter App Secret để không tự thay đổi workflow đã lưu. Ô password ở version 1 chỉ che giá trị; chuyển expression hoặc export workflow vẫn có thể lộ. Để chuyển sang cách lưu mới, thêm lại node token version 2 (hoặc đổi version nếu giao diện hỗ trợ), chọn credential, nối lại luồng rồi xóa node/giá trị secret cũ và lưu workflow. Cập nhật package không tự xóa secret trong workflow/history đã tồn tại. Nếu đã chia sẻ ảnh hoặc workflow có secret, reset App Secret trong Lark rồi lưu giá trị mới vào credential.

Token đầu ra được hiển thị và có thể lưu trong lịch sử thực thi theo thiết kế của luồng truyền token. Kiểm soát quyền truy cập workflow/lịch sử; việc dùng credential cho App Secret không che token output.

Node Base nhận token sẽ không gọi credential hoặc endpoint cấp token. Nếu token hết hạn, chạy lại node **Lark Access Token**; Base không có App Secret để tự refresh. Workflow Base phiên bản 1 tiếp tục dùng chế độ credential; khi nâng package lên 0.2.2 cần chọn lại credential **Lark API (Vutiendung)**. Ở phiên bản node 2 vẫn có thể chọn **Credential ứng dụng** nếu cần cơ chế tự làm mới như trước.

Import [workflow lấy token rồi đọc Base](examples/token-list-records.workflow.json). Node token trong mẫu dùng version 2, không chứa parameter App ID/App Secret hoặc credential thật. Chọn credential tại node token sau khi import; không cần chọn lại ở các node Base dùng token.

## Tính năng

### Bộ lọc trực quan từ 0.3.0

Node **Lark Base (Vutiendung)** mới mặc định là node version **3**. Chọn thao tác **Tìm kiếm**, giữ **Cách nhập bộ lọc → Chọn điều kiện**, rồi:

1. Chọn **Kết hợp điều kiện**: tất cả (AND) hoặc bất kỳ (OR).
2. Bấm **Thêm điều kiện**, chọn cột từ danh sách. Có thể đổi sang **Nhập tên cột** nếu cần nhập trực tiếp hoặc dùng expression; dùng tên cột chính xác, không dùng Field ID.
3. Chọn phép lọc: là, không bằng, chứa, không chứa, rỗng, không rỗng, lớn hơn, lớn hơn hoặc bằng, nhỏ hơn, nhỏ hơn hoặc bằng. Các phép hợp lệ còn phụ thuộc kiểu cột; `like`/`in` không có trong giao diện vì API hiện chưa hỗ trợ.
4. Chọn **Một giá trị**, **Nhiều giá trị** hoặc **Ngày**. Với rỗng/không rỗng, không cần nhập giá trị.

Ví dụ điều kiện: **Shop → Là → Một giá trị → Shop A**. Muốn tìm Shop A hoặc Shop B, thêm hai điều kiện **Là** và chọn OR. Với cột nhiều lựa chọn, có thể dùng **Chứa → Nhiều giá trị**, nhập:

```text
Khách mới
Đã liên hệ
```

Mỗi dòng trở thành một phần tử trong mảng `value` của API; không tách dấu phẩy và không tự thêm dấu ngoặc JSON. Các dòng chỉ có khoảng trắng bị bỏ qua; khoảng trắng ở đầu/cuối dòng có nội dung được giữ nguyên. Ý nghĩa của mảng theo quy tắc phép lọc/loại cột Lark, không mặc định là OR cho mọi kiểu cột. Nếu có mảng từ node trước, có thể dùng expression `{{ $json.tags.join('\n') }}` trong ô nhiều giá trị.

Với cột ngày, chọn **Ngày** rồi chọn ngày cụ thể, hôm nay/hôm qua/ngày mai, tuần này/tuần trước hoặc 7 ngày qua/tới. Ngày cụ thể tự chuyển sang `ExactDate` và timestamp mili giây. Từ 0.3.1, giờ từ ô lịch không kèm offset (dạng `2026-01-02T00:00:00` hoặc `2026-01-02 00:00:00`) và ngày YYYY-MM-DD được hiểu theo múi giờ workflow. Muốn dùng giờ Việt Nam, đặt timezone workflow là `Asia/Ho_Chi_Minh` hoặc `Asia/Bangkok`. ISO từ expression có Z hoặc offset như `2026-01-02T00:00:00+07:00` giữ nguyên thời điểm. Cột ngày chỉ hỗ trợ là, lớn hơn, nhỏ hơn, rỗng và không rỗng; ngày tương đối do Lark diễn giải. Với cột người, giá trị là open_id; ô đánh dấu dùng true/false.

Danh sách cột cần quyền đọc metadata và token hợp lệ; chạy node cấp token trước nếu token lấy từ node trước. Khi thực thi bộ lọc có điều kiện, node tải metadata để kiểm tra tên/kiểu cột. Không có điều kiện thì không gửi filter hoặc tải metadata cho bộ lọc. Bộ lọc trực quan áp dụng cho **Tìm kiếm**, thao tác **Liệt kê** vẫn lấy record không có bộ lọc.

Workflow node version 1/2 cũ vẫn hiện JSON như trước. Muốn dùng giao diện mới, thêm node Base mới version 3 hoặc đổi version nếu n8n hỗ trợ. Khi chuyển node đang có JSON sang version 3, chọn **JSON nâng cao** để giữ bộ lọc cũ; bộ lọc cũ vẫn được lưu nhưng không áp dụng khi chọn chế độ trực quan. JSON nâng cao tiếp tục hỗ trợ một cấp nhóm `children` để kết hợp AND/OR phức tạp.

Xem [workflow tìm kiếm bằng điều kiện](examples/search-records.workflow.json) và [hướng dẫn lọc chính thức của Lark](https://github.com/larksuite/openclaw-lark/blob/main/skills/feishu-bitable/references/examples.md#operator-类型10-种).

| Tài nguyên | Thao tác hiển thị | Giá trị nội bộ |
| ---------- | ----------------- | -------------- |
| Record     | Liệt kê           | `list`         |
| Record     | Lấy một bản ghi   | `get`          |
| Record     | Tạo               | `create`       |
| Record     | Cập nhật          | `update`       |
| Record     | Xóa               | `delete`       |
| Record     | Tìm kiếm          | `search`       |
| Record     | Tạo theo lô       | `batchCreate`  |
| Record     | Cập nhật theo lô  | `batchUpdate`  |
| Record     | Xóa theo lô       | `batchDelete`  |

- Xác thực bằng App ID, App Secret và `tenant_access_token` của ứng dụng nội bộ.
- Nhận URL `/base/...` thuộc `larksuite.com`, `larkoffice.com`, `feishu.cn` hoặc App Token trực tiếp.
- Tự lấy bảng/view từ URL; Table có hai chế độ chọn theo tên hoặc nhập ID.
- Tự phân trang, hỗ trợ trả tất cả hoặc giới hạn số record; giữ `record_id`, `fields` và metadata API trả về.
- Tìm kiếm với filter, view, sort; bộ lọc trực quan ở node version 3 hoặc JSON nâng cao có kiểm tra cấu trúc.
- Create/Update nhận JSON hoặc expression trả đối tượng, kiểm tra metadata trước khi ghi; Update chỉ gửi cột được cung cấp.
- Chia batch tuần tự, có thể đặt từ 1 đến 500 bản ghi/lô; hỗ trợ Continue On Fail và liên kết item đầu vào.
- Làm mới token có giới hạn; xử lý rate limit và lỗi có context tiếng Việt, không ghi log secret/token.

## Cài đặt

### Nâng lên 0.2.2 và xử lý credential bị trùng

Các bản trước 0.2.2 đăng ký credential tên nội bộ `larkApi`, trùng với n8n-nodes-bizflow. Bizflow lưu secret ở `appToken`, package này dùng `appSecret`; khi schema bị ghi đè, credential cũ có thể mở bằng form sai và báo thiếu App Secret. Đây là xung đột định danh, không đủ để kết luận dữ liệu đã mất.

1. Không bấm Save, sửa hoặc xóa credential cũ trong lúc form đang hiển thị sai. Không đổi loại credential Lark của package khác.
2. Cập nhật **@vutiendung/n8n-nodes-lark-base** lên **0.2.2** sau khi bản này được phát hành. Bản sửa chỉ đăng ký `vutiendungLarkApi`, hiển thị **Lark API (Vutiendung)**; không giữ alias `larkApi`.
3. Nhờ quản trị hosting khởi động lại tiến trình/container n8n để nạp lại registry credential, rồi tải lại trình duyệt. Chỉ refresh trình duyệt không bảo đảm bỏ đăng ký cũ trong bộ nhớ server.
4. Mở lại credential của node Lark/Bizflow cũ: form gốc phải có **App ID / App Token**. Nếu chưa từng lưu bằng form sai thì dữ liệu đã lưu có thể vẫn nguyên; chạy thử workflow cũ để xác nhận. Nếu vẫn sai, kiểm tra còn package khác đăng ký `larkApi` hoặc tiến trình nào chưa được restart.
5. Với node thuộc package Vutiendung, tạo credential **Lark API (Vutiendung)** riêng từ App ID/App Secret trong Lark Developer Console và chọn lại tại node token version 2 hoặc Base dùng credential (kể cả Base version 1). Base nhận token ngoài không cần đổi credential.

Bản vá không tự sửa dữ liệu credential, workflow hoặc lịch sử trên server. Những credential tạo bởi package này ở bản cũ vẫn mang type `larkApi`; không tự chuyển chúng vì type này cũng thuộc package khác. Giữ credential cũ cho workflow của package khác. Nếu đã lưu bằng form sai và dữ liệu gốc không còn, cần bản sao lưu hoặc cấu hình lại credential theo form gốc.

### Cài bản local hiện tại

Cần một n8n self-hosted cho phép cài community node. Trong thư mục dự án:

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
npm pack
npm run test:package
```

Lệnh `npm pack` tạo `vutiendung-n8n-nodes-lark-base-0.3.1.tgz` và tự chạy lại lint/build/test qua `prepack`. `npm run test:package` kiểm tra chính tarball đó với runtime 2.4.1, hợp đồng enum đầu nối cũ, entry cũ đang lỗi trong cache, định danh credential riêng và việc không nạp runtime n8n khi đăng ký metadata. Từ 0.3.1, Luxon là dependency runtime trực tiếp để chuyển múi giờ của bộ lọc ngày; npm cài dependency này cùng package.

Cài tệp `.tgz` vào thư mục community packages của **chính tiến trình hoặc container n8n đang chạy**, thường là `~/.n8n/nodes`:

```bash
npm install /duong-dan-day-du/vutiendung-n8n-nodes-lark-base-0.3.1.tgz
```

Sau đó khởi động lại n8n. Với Docker, cần đưa gói vào container hoặc volume tương ứng; cài ở máy host riêng không tự cài vào container.

### Cài từ npm

Trong n8n self-hosted, mở **Settings → Community nodes → Install**, nhập `@vutiendung/n8n-nodes-lark-base` và hoàn tất cài đặt. Thông tin phiên bản nằm trên [trang package npm](https://www.npmjs.com/package/@vutiendung/n8n-nodes-lark-base).

## Phát triển

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
```

Trên PowerShell nếu bị chặn `npm.ps1`, thay `npm` bằng `npm.cmd`. Không cần thay Execution Policy.

`npm run dev` dùng CLI chính thức, biên dịch khi sửa file và khởi chạy một n8n riêng. Để dùng n8n đã có:

```bash
npm run dev -- --external-n8n --custom-user-folder /thu-muc-du-lieu-n8n
```

Khởi động n8n ngoài với `N8N_DEV_RELOAD=true` và cùng thư mục dữ liệu. `--custom-user-folder` là thư mục cha của `.n8n`. Chạy development trên môi trường thử nghiệm. Chi tiết tương thích và các lệnh đã kiểm chứng có trong [tài liệu kiểm chứng](docs/verification.md).

CLI được ghim ở `0.18.0`, kiểu n8n tại `n8n-workflow@2.10.0`, TypeScript `5.9.3`. Bộ này cài đặt và kiểm thử được trên Node.js `26.2.0`/Windows hiện tại; chưa chứng nhận toàn bộ phiên bản n8n runtime. CLI mới được khảo sát nhưng dependency native gây lỗi cài đặt trên máy này. Nên dùng Node.js LTS phù hợp với phiên bản n8n triển khai và xác minh bằng checklist trước khi dùng thật.

Từ 0.1.1, đã kiểm tra nạp class từ tarball với `n8n-workflow@2.4.1`. Peer `n8n-workflow` là tùy chọn; môi trường n8n cung cấp runtime này. Không cần cài thêm hoặc nâng riêng `n8n-workflow` trong thư mục community nodes để dùng package.

## Tạo ứng dụng Lark

1. Mở [Lark Developer Console](https://open.larksuite.com/app) hoặc [Feishu Developer Console](https://open.feishu.cn/app).
2. Tạo ứng dụng nội bộ bằng **Create Custom App**. MVP không hỗ trợ store app cần app ticket/tenant key.
3. Trong **Credentials & Basic Info**, lấy App ID và App Secret.
4. Thêm quyền API trong **Permissions & Scopes**, tạo phiên bản và phát hành; hoàn tất phê duyệt của quản trị viên nếu tenant yêu cầu.

Lưu App Secret trong credential n8n; node lấy token version 2 sử dụng cùng credential này. Node token version 1 cũ lưu secret trong parameter cần được chuyển đổi nếu đã sử dụng. Không đưa secret thật vào repository, workflow mẫu hoặc báo cáo lỗi.

## Quyền API

Các scope Base được xác nhận từ tài liệu chính thức:

| Nhu cầu                          | Scope                                                   |
| -------------------------------- | ------------------------------------------------------- |
| Đọc Base, bảng, field và bản ghi | `bitable:app:readonly` — View, comment, and export Base |
| Tạo/cập nhật/xóa bản ghi         | `bitable:app` — View, comment, edit and manage Base     |

Trong console, chọn quyền ứng dụng phù hợp với `tenant_access_token`. Có thể dùng quyền quản lý Base cho cả đọc và ghi; không cần xin đồng thời quyền chỉ đọc nếu quyền quản lý đã đáp ứng API. Console có thể cung cấp các scope chi tiết hơn: kiểm tra mục **Required scopes** của từng endpoint tại thời điểm triển khai. Xem [nguồn tham khảo](docs/sources.md); không suy ra quyền ứng dụng từ việc người tạo app có thể mở Base.

## Cấp quyền truy cập Base

Scope API và quyền truy cập dữ liệu là hai việc riêng:

1. Mở Base bằng tài khoản có quyền quản lý.
2. Dùng menu **… → … More → Add applications** khi có, chọn ứng dụng vừa tạo và cấp quyền đọc hoặc chỉnh sửa phù hợp. Nhãn/vị trí menu có thể khác theo giao diện Lark.
3. Nếu không tìm thấy app, kiểm tra đã cấp ít nhất một quyền Cloud Docs/Base, phát hành và cài ứng dụng vào đúng tenant.
4. Nếu Base bật quyền nâng cao, kiểm tra vai trò của ứng dụng và quyền trên bảng, cột, bản ghi. Thiếu quyền có thể khiến API trả dữ liệu trống dù request thành công.
5. Thử Liệt kê trước, sau đó thử ghi trên Base thử nghiệm. Bảng đồng bộ từ nguồn khác có thể cấm thêm/sửa/xóa dù ứng dụng có quyền.

URL Wiki không chứa trực tiếp App Token. MVP báo lỗi rõ ràng và yêu cầu token của Base gốc; không coi Wiki token là App Token.

## Cấu hình credential trong n8n

1. Thêm node **Lark Base**.
2. Tạo credential **Lark API (Vutiendung)**, tên nội bộ `vutiendungLarkApi`. Không chọn Lark API của package khác.
3. Chọn nền tảng **Lark** hoặc **Feishu** tương ứng nơi tạo ứng dụng.
4. Nhập App ID và App Secret, lưu rồi kiểm tra credential.
5. Kiểm tra thành công chỉ xác nhận lấy được tenant token. Chạy node để kiểm tra scope API và quyền truy cập Base cụ thể.

URL Base không tự chuyển nền tảng credential. Điều này tránh gửi thông tin xác thực sang miền do URL đầu vào quyết định.

## Ví dụ workflow

### Liệt kê bản ghi

```text
Manual Trigger
    ↓
Lark Base
  Tài nguyên: Record
  Thao tác: Liệt kê
  Base: https://example.larksuite.com/base/ABC123?table=tblABC123
  Table: chọn bảng theo tên, hoặc Nhập ID để trống nếu URL đã có bảng
  Trả về tất cả: bật
```

Mỗi item đầu ra giữ dạng:

```json
{
	"record_id": "recABC123",
	"fields": { "Tên": "An", "Số lượng": 3 }
}
```

Khi tắt **Trả về tất cả**, **Giới hạn** mặc định là 50 và được áp dụng qua nhiều trang. Bảng trống trả không có item. Mỗi item đầu vào thực hiện thao tác riêng; ví dụ hai item đầu vào Liệt kê sẽ đọc hai lần.

Import tệp [workflow mẫu](examples/list-records.workflow.json), chọn credential và thay Base/bảng trước khi chạy. Tệp mẫu không chứa credential.

### Tạo bản ghi

Trong **Fields (JSON)**, dùng tên cột đúng với bảng của bạn:

```json
{
	"Tên": "An",
	"Số lượng": "3",
	"Đã xử lý": false,
	"Ngày": "2026-10-24"
}
```

Hoặc chuyển cả ô sang expression trả đối tượng:

```javascript
{{ { 'Tên': $json.name, 'Số lượng': $json.quantity } }}
```

Các tên cột trên chỉ là ví dụ. Node không đòi hỏi schema cố định, không tạo hoặc đổi cột.

### Cập nhật và xóa

Chọn **Cập nhật**, đặt **Record ID** bằng `{{ $json.record_id }}`, rồi chỉ gửi cột cần đổi. `{"Tên":"Tên mới"}` không thay các cột khác. `{"Tên":null}` yêu cầu xóa giá trị cột; không dùng chuỗi `"null"`.

Chọn **Xóa** để xóa một Record ID. Kết quả có `record_id` và `deleted`; workflow phía sau cần kiểm tra `deleted`.

### Tìm kiếm

Với node version 3, chọn **JSON nâng cao** nếu muốn dùng ví dụ dưới. Với node version 1/2, nhập trực tiếp trong **Bộ lọc (JSON)**:

```json
{
	"conjunction": "and",
	"conditions": [{ "field_name": "Tên", "operator": "is", "value": ["An"] }]
}
```

Trong **Tùy chọn → Sắp xếp (JSON)**:

```json
[{ "field_name": "Tên", "desc": false }]
```

View nhận ID `vew...`, mặc định lấy từ URL nếu bảng trong URL trùng bảng đã chọn. Khi chọn bảng khác, node bỏ view cũ. Bộ lọc dùng cấu trúc Search chính thức; giá trị điều kiện ngày/người/checkbox có quy ước riêng của Lark, không tự chuyển theo normalization dùng cho ghi.

### Thao tác theo lô

**Tạo theo lô** nhận:

```json
[{ "fields": { "Tên": "An" } }, { "fields": { "Tên": "Bình" } }]
```

**Cập nhật theo lô** nhận:

```json
[{ "record_id": "recABC123", "fields": { "Tên": "Tên mới" } }]
```

**Xóa theo lô** nhận:

```json
["recABC123", "recDEF456"]
```

Mỗi đầu vào chứa một mảng độc lập; node tự chia lô tuần tự. Khi bật **Continue On Fail / On Error → Continue (using regular output)**, lỗi API của lô được trả cho từng phần tử của lô với `error`, `batch_index`, `record_index`; các lô sau vẫn tiếp tục. Chỉ số bắt đầu từ 0. Lỗi cấu trúc đầu vào trước khi ghi trả một error item cho item đầu vào đó.

Các lô đã thành công không được hoàn tác khi lô sau lỗi. Kết quả cập nhật/xóa được sắp lại theo Record ID đầu vào; tạo theo lô giữ thứ tự API trả về, không cam kết thứ tự server khi API không bảo đảm. Các output cùng mảng được liên kết với n8n item đầu vào tương ứng.

## Kiểu dữ liệu ghi

| Kiểu cột                                                | Giá trị nhận                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------- |
| Text, Phone; Email nếu được lưu ở cột Text              | Chuỗi, không tự chuyển object thành văn bản                               |
| Number                                                  | Số hữu hạn hoặc chuỗi số thập phân/khoa học hợp lệ; không nhận chuỗi rỗng |
| Checkbox                                                | Boolean hoặc chuỗi `"true"`/`"false"`                                     |
| Date / DateTime                                         | Timestamp **mili giây**, `YYYY-MM-DD` theo UTC, hoặc ISO 8601 có múi giờ  |
| Single Select                                           | Tên lựa chọn đã tồn tại trong metadata                                    |
| Multi Select                                            | Mảng tên lựa chọn; loại bỏ tên lặp, không tách chuỗi bằng dấu phẩy        |
| URL                                                     | Chuỗi HTTP/HTTPS hoặc `{ "link": "https://...", "text": "Nhãn" }`         |
| Person                                                  | Mảng `{ "id": "ou_..." }`, dùng `open_id`; không tìm người theo tên/email |
| Attachment                                              | Mảng `{ "file_token": "..." }` của tệp đã có quyền; không tải tệp lên     |
| Liên kết một/hai chiều                                  | Mảng Record ID đã tồn tại; quyền và ràng buộc do Lark kiểm tra            |
| Lookup, Formula, cột hệ thống, Location, kiểu chưa biết | Báo lỗi khi ghi; vẫn giữ nguyên dữ liệu khi đọc                           |

Không gửi field `undefined`; hãy bỏ khóa nếu không muốn cập nhật. `null` được gửi cho cột hỗ trợ ghi để xóa giá trị; Lark vẫn có thể từ chối ở cột bắt buộc hoặc có ràng buộc riêng.

## Xử lý lỗi

Nếu báo `UNIQUE constraint failed: installed_nodes.name`, dùng bản 0.1.2 trở lên. Ví dụ Bizflow đã có node tên hiển thị `Lark Base`; package này dùng `Lark Base (Vutiendung)` để hai node không trùng trên schema còn khóa duy nhất theo tên. Không cần xóa bảng dữ liệu hoặc gỡ package Bizflow để xử lý xung đột tên này.

Nếu n8n báo `Class could not be found`, cập nhật hoặc cài lại phiên bản 0.1.1 trở lên rồi khởi động lại n8n nếu cần. Thông báo này còn có thể che một TypeError trong quá trình khởi tạo, không chỉ lỗi tên class. Nếu vẫn xảy ra, lấy log backend đầy đủ gồm stack trace và đường dẫn module được resolve; không chỉ dựa vào thông báo trên UI.

Bản 0.1.3 thay đường dẫn entry node/credential để tránh cache của các entry đã cài lỗi ở 0.1.0–0.1.2. Có thể thử bản này khi không có quyền restart dịch vụ; không bảo đảm giải quyết mọi nguyên nhân của thông báo class nếu chưa có log. Đây không phải thao tác đổi định danh workflow hoặc credential. Các bước phát triển chỉ đóng gói local; người duy trì tự chạy publish và xác thực khi muốn phát hành.

Lỗi có tên thao tác, HTTP status, mã/thông báo Lark khi có. Khi không tải được danh sách bảng, chuyển Table sang **Nhập ID**. Khi bị từ chối quyền, kiểm tra cả scope và việc thêm ứng dụng vào Base.

Transport làm mới tenant token một lần cho mã token không hợp lệ đã đối chiếu SDK. Với HTTP 429 hoặc mã rate limit, thử thêm tối đa hai lần, ưu tiên `Retry-After`, mỗi lần chờ không quá 30 giây. Header yêu cầu chờ lâu hơn sẽ trả lỗi để workflow tự lên lịch lại.

Lỗi mạng và HTTP 5xx không tự gửi lại thao tác: request ghi có thể đã thành công trước khi mất phản hồi. Kiểm tra Base trước khi chạy lại Create/Batch Create để tránh bản ghi trùng. Project không log request/response xác thực hay access token.

## Giới hạn hiện tại

- Chưa thử trực tiếp với n8n UI và tenant/Base thật; xem [checklist](docs/manual-test.md).
- Chưa có OAuth người dùng, store app, Wiki resolver, Auto Map, Upsert, trigger hoặc các dịch vụ Lark Suite khác.
- Fields ghi dữ liệu và sắp xếp dùng JSON; bộ lọc có giao diện chọn điều kiện hoặc JSON. Chưa có UI dựng mapping dữ liệu ghi theo schema.
- Return All giữ kết quả trong bộ nhớ; chưa stream, không có snapshot khi bảng đang bị thay đổi đồng thời.
- Batch không có transaction qua nhiều request; không tự phục hồi trạng thái đã ghi hoặc tự retry Create khi mạng lỗi.
- Có cảnh báo audit ở dependency phát triển của n8n-workflow; chi tiết và lý do không ép đổi major trong [kiểm chứng](docs/verification.md).

## Hướng phát triển

Thứ tự đề xuất: kiểm thử Base thật và chốt tương thích n8n runtime → nâng tooling trên Node.js LTS → UI mapping theo metadata → Upsert có chính sách khóa trùng/cạnh tranh rõ ràng → Wiki resolver → trigger và các node Lark Suite riêng khi có nhu cầu.

Xem thêm [kiến trúc](docs/architecture.md), [kế hoạch và khảo sát](docs/implementation-plan.md), [nguồn API](docs/sources.md), [lịch sử thay đổi](CHANGELOG.md).
