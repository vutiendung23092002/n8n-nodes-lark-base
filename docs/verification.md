# Kiểm chứng và tương thích

## Môi trường đã chạy

Ngày: 24/10/2026. Windows, PowerShell, Node.js 26.2.0, npm 11.13.0. Thực tế gọi `npm.cmd` vì PowerShell chặn `npm.ps1`.

| Thành phần                                | Phiên bản đã ghim |
| ----------------------------------------- | ----------------- |
| @n8n/node-cli                             | 0.18.0            |
| n8n-workflow dùng cho phát triển/kiểm thử | 2.10.0            |
| TypeScript                                | 5.9.3             |
| ESLint                                    | 9.39.1            |
| Prettier                                  | 3.6.2             |

Host n8n cung cấp peer dependency tùy chọn `n8n-workflow`; npm không tự cài peer tùy chọn. Từ 0.3.1, package khai báo dependency runtime Luxon 3.7.2 để chuyển múi giờ của bộ lọc ngày, không kèm SDK Lark hay HTTP library khác. Phiên bản n8n thực tế do môi trường triển khai quyết định. Chưa khẳng định mọi phiên bản n8n đều tương thích chỉ từ việc build thành công.

## Khảo sát tooling mới

Đã tra npm cho `@n8n/create-node@0.53.2`, `@n8n/node-cli@0.53.4` và `n8n-workflow@2.16.0`. Lệnh chạy initializer và lần cài ban đầu kéo dependency native `isolated-vm`, chuyển sang node-gyp trên Node.js 26/Windows và thất bại vì không có Python. Đã dừng initializer, ghim bộ tương thích rồi cài lại thành công; không tắt install script toàn cục và không thay Node.js hệ thống.

Đã tra `n8n@2.44.6` có engine `node >=24.0.0` tại thời điểm khảo sát. Điều kiện engine không bảo đảm mọi dependency native có sẵn binary cho Node.js 26. Với môi trường triển khai, ưu tiên Node.js LTS theo yêu cầu của bản n8n được chọn và kiểm tra cài thực tế.

## Lệnh kiểm chứng

| Lệnh                    | Mục đích                                                        |
| ----------------------- | --------------------------------------------------------------- |
| `npm install`           | Cài dependency và tạo lockfile; đã thành công với bộ ghim       |
| `npm run typecheck`     | Kiểm tra kiểu nguồn và toàn bộ test, không phát sinh tệp        |
| `npm run lint`          | Chạy CLI lint chính thức với ngoại lệ bản địa hóa có giải thích |
| `npm test`              | Trình chạy node:test qua tsx, không cần credential              |
| `npm run build`         | CLI biên dịch TypeScript, copy SVG và node JSON vào dist        |
| `npm run dev -- --help` | Xác minh lệnh dev và cờ của CLI đã cài                          |
| `npm pack`              | Chạy prepack và tạo tarball để cài local; không publish         |

Kết quả bản MVP ban đầu: install, cài sạch từ lockfile bằng `npm ci`, typecheck, lint, build thành công; 91/91 test đạt, không có ca bỏ qua hoặc TODO. Có cả thử Return All với 130.001 record giả lập qua nhiều trang.

Gói phát hành có tên `@vutiendung/n8n-nodes-lark-base`; tarball bản sửa mới là `vutiendung-n8n-nodes-lark-base-0.3.1.tgz`. Đã kiểm tra node, credential, shared transport, SVG, node JSON, tài liệu và workflow mẫu. Gói không chứa node_modules, tests hoặc tệp .env. Người dùng tự publish và xác thực bằng khóa điện thoại; không chạy publish tự động.

## Bộ chọn ngày và múi giờ ở bản 0.3.1

Ảnh lỗi cho thấy ngày 2026-01-02 00:00:00 từ picker bị normalizeDate từ chối vì không có offset. Đối chiếu mã UI n8n chính thức: value-format của dateTime là YYYY-MM-DDTHH:mm:ss, không kèm timezone. Bản sửa nhận cả T/dấu cách trong bộ lọc, dùng context.getTimezone() và Luxon 3.7.2; không thay quy tắc ngày trong dữ liệu ghi. ISO có offset/timestamp không bị chuyển timezone lần hai. Giờ DST không tồn tại hoặc bị lặp được báo rõ.

Kết quả: typecheck/lint/build, 151/151 test và kiểm tra tarball đều đạt. Cài archive 0.3.1 bằng npm trong thư mục tạm sạch (--omit=dev, --ignore-scripts), xác minh Luxon 3.7.2 thực sự được cài; không mock module Luxon trong phép thử này. Nạp package bằng PackageDirectoryLoader thật của n8n-core@2.4.1, áp defaults và expression bằng NodeHelpers/Workflow thật: cả chuỗi T và dấu cách chạy Search thành công với timezone Asia/Ho_Chi_Minh và UTC, payload ExactDate đúng timestamp. HTTP giả lập, chưa xác minh lại UI hoặc kết quả API Lark thật trên hosting; không publish.

## Bộ lọc trực quan ở bản 0.3.0

Base node version 3 mặc định dựng điều kiện bằng UI; version 1/2 giữ JSON. Có 10 operator từ ví dụ chính thức của Lark, AND/OR, chọn cột qua metadata hoặc nhập tên, giá trị đơn/nhiều dòng/ngày. isEmpty/isNotEmpty gửi value=[]; cột ngày có kiểm tra operator và ExactDate dùng normalizeDate chung. JSON nâng cao giữ parser và children cũ.

Kiểm thử mới xác minh payload của cả 10 phép lọc, CRLF/dấu phẩy/khoảng trắng, giá trị 0/false từ expression, mốc ngày/ngày cụ thể, cột không tồn tại, lỗi theo vị trí và Continue On Fail, filter nhất quán qua phân trang, dropdown cột phân trang đúng bảng/quyền, defaults/visibility theo version và workflow mẫu sau khi n8n áp dụng defaults. Chưa kiểm thử API Lark thật hoặc giao diện trình duyệt của hosting; checklist thủ công có các bước đối chiếu với bộ lọc Lark.

Kết quả: typecheck/lint/build và 145/145 test đạt; tarball nạp được trong ba chế độ runtime của check-package. Thử riêng archive 0.3.0 bằng PackageDirectoryLoader, NodeHelpers và Workflow/Expression thật từ n8n 2.4.1: node version 3 nạp thành công, expression bên trong fixedCollection được giải đúng, mảng từ expression .join(newline) tạo đúng nhiều giá trị và giữ dấu phẩy, Search gửi đúng bộ lọc, loadOptions trả đúng danh sách cột, không đọc credential khi dùng token ngoài. HTTP hoàn toàn giả lập, không truy cập server người dùng và không publish.

## Xung đột credential ở bản 0.2.2

Đối chiếu tarball n8n-nodes-bizflow@1.1.1: `LarkApi.credentials.js` đăng ký `larkApi`, trường `appId` và `appToken`. Package này trước 0.2.2 cũng đăng ký `larkApi` nhưng dùng `appSecret`, khiến UI có thể mở credential cũ bằng schema sai. Mã loader n8n lập chỉ mục credential theo tên không có scope package. Không thể kết luận dữ liệu trên server bị mất chỉ từ ô App Secret trống; người dùng xác nhận chưa lưu form sai.

Bản sửa chỉ đăng ký `vutiendungLarkApi` từ entry mới `VutiendungLarkApi.credentials.js`, không có alias/fallback `larkApi`. Các node Vutiendung dùng credential phải chọn credential mới, kể cả Base version 1. Không tự di chuyển dữ liệu đã lưu. Kiểm thử registry theo cả hai thứ tự nạp và kiểm tra tarball không kèm hai entry credential cũ; các ca thực thi xác minh tên credential được đọc.

Kết quả: typecheck, lint, build, 115/115 test và kiểm tra tarball đều đạt. Thử thêm bằng `PackageDirectoryLoader` thật của n8n-core@2.4.1 và credential thật từ tarball Bizflow 1.1.1: tái hiện bản 0.2.1 ghi đè schema `larkApi`; bản 0.2.2 giữ schema App ID/App Token của Bizflow ở cả hai thứ tự nạp, đồng thời đăng ký credential riêng và chạy node lấy token bằng HTTP giả lập thành công. Chưa kiểm tra UI hoặc dữ liệu trên server người dùng; cần hosting nạp lại registry và xác nhận workflow cũ hoạt động. Không publish trong phiên sửa lỗi.

## Credential tại node lấy token từ bản 0.2.1

Người dùng xác nhận ô App Secret dạng parameter hiện giá trị khi chuyển expression. Node token mới mặc định version 2, đọc credential Lark API do n8n quản lý; property App ID/App Secret/nền tảng cũ chỉ hiện ở version 1. Kiểm thử NodeHelpers xác minh không có các property đó trong defaults của version 2, getNodeParameter không bị gọi cho secret khi thực thi version 2, và lỗi API không trả giá trị secret credential.

114/114 test đạt; không chứng minh trình duyệt hoặc toàn bộ instance không có secret cũ. Workflow mẫu không có parameter secret. Giá trị trong node version 1/historical execution không được tự di chuyển hay xóa; người dùng cần cấu hình credential, xóa giá trị cũ và reset secret đã bị lộ. Token output tiếp tục hiển thị theo chức năng truyền token cho node sau.

## Node token riêng ở bản 0.2.0

Thêm node Lark Access Token và Base node version 2. Các kiểm thử mới kiểm tra request cấp token đúng nền tảng, output không có App Secret/input, token theo item, lỗi/Continue On Fail, token ngoài không gọi credential hoặc token endpoint, hết hạn không refresh tự động, selector dùng token ngoài, và NodeHelpers thật xác minh credential/defaults theo version.

Kết quả: typecheck, lint, build, 111/111 unit/regression test và test tarball đạt. Hai node cùng credential nạp được trong ba chế độ runtime đã mô tả; entry cũ đang lỗi trong cache không ảnh hưởng entry mới.

Đã thử thêm chính tarball bằng PackageDirectoryLoader, Workflow và Expression thật của n8n 2.4.1 trong môi trường tạm. Node cấp token chạy trước, expression `={{ $json.tenant_access_token }}` được engine giải để Base đọc record qua HTTP giả lập. Có đúng một request cấp token, một request đọc Base và không lần nào gọi getCredentials. Credential của Base version 2 được ẩn đúng trong chế độ token. Chưa gọi Lark thật hoặc xác minh giao diện trên server dịch vụ của người dùng.

Chế độ App Secret trong parameter được thực hiện theo yêu cầu người dùng; secret có thể nằm trong workflow và token đầu ra có thể nằm trong lịch sử thực thi. Kiểm thử đảm bảo project không tự đưa secret vào output/error, không khẳng định dữ liệu workflow/lịch sử của n8n không chứa giá trị người dùng đã nhập.

## Entry và cache ở bản 0.1.3

Người dùng xác nhận cài thành công trên Hankorea sau bản 0.1.2, nhưng Phoai (n8n 2.4.1) vẫn báo class và người dùng không có quyền restart. Chưa nhận được log backend để chốt nguyên nhân instance Phoai.

Đã tái hiện bằng loader thật 2.4.1 rằng constructor lỗi sau require có thể giữ export cũ trong cache; cập nhật file cùng đường dẫn không bảo đảm nạp lại. Bản 0.1.3 đổi entry node/credential sang đường dẫn mới nhưng giữ định danh node/credential. Bước metadata không require runtime; helper lỗi và chờ retry dùng CommonJS chỉ khi chạy thao tác.

Typecheck, lint, build và 99/99 test đạt. Tarball test kiểm tra ba chế độ: runtime 2.4.1, hợp đồng enum cũ và cấm nạp runtime khi đăng ký. Hai entry lỗi cũ được cố tình giữ trong cache xuyên suốt; entry mới vẫn khởi tạo thành công. Kiểm tra này không chứng minh đã sửa được server Phoai; cần thử bản phát hành mới hoặc lấy log gốc nếu còn lỗi.

Đã kiểm tra bổ sung bằng `PackageDirectoryLoader` thật của `n8n-core@2.4.1` trong môi trường tạm: tải chính tarball 0.1.3, giữ cache constructor lỗi ở hai đường dẫn cũ, nạp thành công node/credential mới, xác minh SVG tồn tại và chạy execute List với HTTP giả lập trả `rec123`. Không dùng credential hoặc server người dùng trong phép thử này.

## Xung đột tên hiển thị ở bản 0.1.2

Ảnh instance n8n 2.37.9 có Bizflow đã cài cho thấy lỗi `SQLITE_CONSTRAINT: UNIQUE constraint failed: installed_nodes.name`. Đã đọc package chính thức `n8n@2.37.9`: `InstalledPackagesRepository.persistPackageWithNodes` lấy `description.displayName` để lưu cột name, còn type gồm package và tên nội bộ. Entity hiện hành dùng type làm khóa; lỗi ảnh cho thấy database server vẫn có ràng buộc duy nhất trên name, nhưng chưa biết lịch sử migration/schema thực tế của server.

Đã tải `n8n-nodes-bizflow@1.1.1` từ npm và xác nhận node đó có displayName `Lark Base`, name `larkBase`. Bản 0.1.2 dùng displayName/defaults.name `Lark Base (Vutiendung)`, giữ tên nội bộ. Regression test SQLite tái hiện chính thông báo ràng buộc ở schema tối thiểu có UNIQUE(name), sau đó lưu thành công cả hai node. Đây là kiểm tra xung đột đã quan sát, không khẳng định schema của mọi bản n8n đều đặt khóa trên name.

Lỗi SQLite này không chứng minh nguyên nhân lỗi class trước đó. Không hướng dẫn xóa database hay gỡ các node đang dùng để né xung đột tên.

Kết quả kiểm chứng bản 0.1.2: typecheck, lint, build và 99/99 kiểm thử đạt; kiểm thử tarball nạp thành công cả node/credential với runtime 2.4.1 và hợp đồng enum cũ. Đã kiểm tra ràng buộc SQLite giả lập; cần người dùng xác nhận cài thành công trên instance dịch vụ đang báo lỗi.

## Kiểm tra lỗi loader ở bản 0.1.1

Người dùng báo n8n 2.4.1 hiển thị `Class could not be found`. Đã đọc loader và trình cài từ package chính thức `n8n-core@2.4.1`, `n8n@2.4.1`: loader lấy tên class từ tên file, khởi tạo trong VM và thay TypeError bằng thông báo tổng quát này. Trình cài 2.4.1 bỏ devDependencies/peerDependencies/optionalDependencies trước khi chạy npm install.

Đã kiểm tra bản 0.1.0 với runtime chuẩn 2.4.1: node và credential nạp được. Đã tái hiện thông báo tương đương khi dùng `n8n-workflow@1.82.0`: thiếu `NodeConnectionTypes` khiến constructor ném TypeError. Chưa có stack trace từ server người dùng để khẳng định thư mục community trên server resolve sang runtime nào.

Bản 0.1.1 bỏ phụ thuộc vào enum runtime bằng kết nối chuỗi `main`; peer tùy chọn hạn chế npm cài runtime riêng bên ngoài trình cài 2.4.1. Thêm sáu ca regression, nâng bộ kiểm thử lên 97 ca. `npm run test:package` giải nén tarball, mô phỏng cách chuẩn bị manifest của n8n 2.4.1, và dùng VM nạp đúng tên class với cả runtime 2.4.1 và hợp đồng enum cũ. Đây là kiểm tra gói/loader, chưa phải chạy n8n UI hay gọi Lark thật.

Ngoài `dev --help`, đã chạy `npm run dev -- --external-n8n --custom-user-folder <thu-muc-tam>`: watcher TypeScript báo Found 0 errors và sau đó được chủ động dừng bằng phím q. Chế độ này không khởi động n8n server. Checklist UI/quyền/API thật nằm ở `manual-test.md`.

## Phạm vi test tự động

- Parser: token trực tiếp, Lark/Feishu/Lark Office, bảng/view/query thừa, URL thiếu token/sai miền/sai HTTPS, Wiki.
- Pagination: một/nhiều trang, trang rỗng giữa chừng, cursor, has_more, Limit, Return All, cursor thiếu/lặp.
- Chunking/batch: nhỏ hơn/bằng/lớn hơn giới hạn, nhiều lô, thứ tự cập nhật/xóa, kiểm tra trước khi ghi, lỗi từng lô và Continue On Fail.
- Normalization: các kiểu phổ biến, null, ngày/múi giờ, cột chỉ đọc, giá trị sai, định dạng phức tạp được hỗ trợ rõ ràng.
- Transport: gộp/cache/refresh token, retry có giới hạn, Retry-After, không retry ghi khi mạng lỗi/5xx, che secret/token, mã lỗi và status.
- Node: endpoint và payload, mỗi record thành item, pairedItem, cache metadata, Update không gửi cột vắng mặt, Search và selector động.

## Audit dependency

Các bản vá cùng major của handlebars, lodash, form-data và minimatch được ghim bằng `overrides` để xử lý cảnh báo kéo theo từ tooling cũ. Toàn bộ test/build/lint vẫn phải chạy sau khi thay overrides.

Audit của môi trường phát triển còn hai mục high: `zod` 3.x và mục phụ thuộc `n8n-workflow`. Advisory là [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), bản sửa được audit ghi ở zod 4.6.6. Không ép dependency của n8n sang major 4 vì không bảo đảm tương thích API. Đây là giới hạn còn lại cần theo dõi khi nâng phiên bản workflow/tooling; module của dự án không dùng zod trực tiếp và các devDependencies không được đóng gói vào tarball.

`npm audit --omit=dev --json` trên lockfile hiện tại báo 0 lỗ hổng. Kết quả này không thay thế audit runtime của bản n8n triển khai.

Không coi `npm audit fix --force` là cách sửa an toàn ở đây: đề xuất có thể đổi major của n8n hoặc quay lại dependency native gây lỗi cài. Quyền và thư viện runtime của n8n triển khai vẫn cần được quản trị theo bản n8n đang chạy.

## Công việc trước khi phát hành

1. Chạy checklist trên n8n UI và Lark/Feishu thật, ghi ma trận phiên bản hỗ trợ.
2. Nâng CLI/workflow trên Node.js LTS, xử lý dependency audit còn lại bằng bản upstream tương thích.
3. Chốt thông tin người duy trì/repository và kiểm tra tên npm; package hiện chưa có URL repository vì thư mục ban đầu chưa là Git repository.
4. Khi phát hành, chạy kiểm tra gói, xác thực tài khoản npm và xác minh lại phiên bản trên registry sau khi publish. Việc publish không thay thế kiểm thử với n8n UI và Base thật.
