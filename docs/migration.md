# Chuyển đổi và tương thích

## Đợt Unreleased về an toàn dữ liệu

Giữ package version 0.3.1 trong working tree, đề xuất 0.4.0 khi phát hành. Giữ node version 1/2/3, default Base 3 và Access Token 2, định danh node/credential, operation/output cũ. Các operation theo Unique Key là bổ sung, không tự thay operation trong workflow đã lưu.

Thay đổi có chủ ý: Update/Delete và batch tương ứng không còn retry rate limit tự động; lỗi có thể xuất hiện sớm để tránh phát lại write chưa chứng minh an toàn. GET/Search tăng retry timeout/5xx có giới hạn. Create/Batch Create thêm UUID v4 client_token, ignore_consistency_check=false và retry có token. Workflow dựa vào timing/retry cũ cần kiểm tra lại. Không tự sửa Retry On Fail của n8n.

Search/List không biến response thiếu danh sách items hợp lệ thành kết quả rỗng. Lookup theo khóa còn kiểm tra has_more/total/cursor/record; response sai gây lỗi, không phải NOT_FOUND. Continue On Fail cần downstream tách error item.

Không migration dữ liệu tự động hoặc xóa duplicate. Thử từng workflow với app có quyền toàn bảng và serialize writer trước khi dùng operation mới.

## Credential riêng

Các bản trước 0.2.2 đăng ký larkApi trùng Bizflow: Bizflow lưu appToken, package này appSecret. Form sai không chứng minh dữ liệu mất; không Save/sửa/xóa credential cũ khi form bị ghi đè. Cập nhật package, nhờ hosting restart n8n để nạp registry rồi tải lại trình duyệt.

Giữ Lark API cũ cho Bizflow, kiểm tra form App ID/App Token và workflow gốc. Node Vutiendung dùng credential Lark API (Vutiendung), type vutiendungLarkApi, tạo riêng từ Developer Console rồi chọn lại. Không tự đổi type của credential cũ vì package khác cũng tham chiếu. Nếu đã Save form sai và mất dữ liệu, dùng backup/cấu hình lại; package không tự khôi phục secret.

## Access Token version 1 → 2

Version 1 giữ App ID/App Secret trong parameter để tương thích; password chỉ che ô nhập, expression/export có thể lộ. Thêm node version 2, chọn credential riêng, nối lại rồi xóa node/parameter secret cũ và lưu. Package update không xóa secret trong history/version/export. Reset secret đã lộ trong Lark.

## Base version 1/2 → 3

Version 1 dùng credential; 2/3 có token ngoài hoặc credential. Base mới mặc định token ngoài. Version 1/2 giữ filter JSON, version 3 mặc định bộ lọc trực quan. Khi đổi version có JSON cũ, chọn JSON nâng cao để dùng lại; không trộn filter đang ẩn. Ô lịch dùng timezone workflow, ISO có offset giữ thời điểm; Fields JSON vẫn theo quy tắc ngày riêng.

## Lỗi cài đặt/cache

Tên hiển thị Lark Base (Vutiendung) tránh trùng Bizflow, giữ name=larkBase. Entry Base là nodes/LarkBase/v1/LarkBase.node.js; credential là credentials/VutiendungLarkApi.credentials.js. Không hạ về entry cũ đã có lỗi constructor/cache.

Class could not be found có thể che TypeError khi khởi tạo. Kiểm tra tarball/dist/manifest, log backend và runtime thực tế. Khi registry/module cũ còn trong bộ nhớ, hosting cần restart; refresh trình duyệt không thay thế restart. Không xóa database/gỡ node đang dùng để né lỗi. Chi tiết ở verification.md.
