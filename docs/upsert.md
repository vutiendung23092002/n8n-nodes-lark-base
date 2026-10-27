# Upsert và Unique Key

## Điều kiện sử dụng

Unique Key trong node KHÔNG phải unique constraint của Lark Base. App phải có quyền thấy toàn bảng/cột khóa; chỉ một pipeline ghi cùng business key tại một thời điểm. Không dùng Upsert để khẳng định atomic uniqueness hoặc exactly-once.

Unique Key Field chỉ nhận metadata type 1 (Text) hoặc 2 (Number), chặn Formula/Lookup/AutoNumber. Dropdown lọc whitelist; nhập tên thủ công vẫn kiểm tra metadata khi chạy. Attachment, Multi Select, User và các giá trị cấu trúc không làm khóa. Text giữ hoa thường/khoảng trắng có nội dung; chuỗi chỉ khoảng trắng bị từ chối. Number chuẩn hóa `"01"` và `1` thành cùng khóa, nhận `0`, chặn số nguyên vượt Number.MAX_SAFE_INTEGER. Mã đơn dài hoặc có số 0 đầu cần dùng Text.

Chuỗi Number còn bị chặn nếu chuyển sang số làm mất chữ số thập phân, ví dụ 1.0000000000000001 thành 1. Giá trị đã bị hệ thống nguồn biến thành Number mất chính xác trước khi tới node không thể được khôi phục; giữ mã định danh dạng Text từ nguồn.

## Upsert đơn

1. Chọn Upsert, Base/Table, Unique Key Field.
2. Fields chứa khóa, ví dụ `{"Mã đơn":"A001","Doanh thu":100}`.
3. Node kiểm tra input/schema rồi Search chính xác `is` với mảng chuỗi giá trị, không dùng view/filter/sort/Limit của UI.
4. Đọc đủ trang, kiểm tra Record ID/fields/khóa trả về. Text đọc từ Lark nhận chuỗi hoặc các đoạn rich text dạng text; cấu trúc không xác định gây lỗi.

| Trạng thái                  | Hành động                                    |
| --------------------------- | -------------------------------------------- |
| `not_found`                 | Create, chỉ Upsert                           |
| `found`                     | Update đúng Record ID                        |
| `duplicate`                 | Lỗi, không ghi                               |
| Lookup throw / phản hồi sai | Lỗi, không ghi; không chuyển thành not_found |

Thành công clone response, thêm action/unique_key, giữ pairedItem.item. Update chỉ gửi các field có trong input. Update By Unique Key nhận khóa trong Fields, không đổi sang khóa khác trong cùng thao tác. Delete By Unique Key nhận Giá trị Unique Key riêng. Cả hai báo lỗi nếu không tìm thấy; không Create hoặc chọn record đầu khi duplicate.

## Batch Upsert

Input là mảng `{fields}` trong mỗi n8n item. Khóa rỗng/trùng trực tiếp được preflight trước request API, cả trùng giữa n8n items cùng bảng/cột. Sau metadata, kiểm tra trùng theo Number chuẩn hóa trước lookup/ghi. Lỗi preflight ở mảng tạo error item cho n8n input đó, không chạy một phần mảng bị từ chối.

Lookup theo nhóm OR tối đa 10 điều kiện và filter tối đa 16.000 byte UTF-8. Đây là mức nội bộ thận trọng, không phải tuyên bố giới hạn tối đa của Lark. Key quá dài bị từ chối trước lookup; không biến payload bị API từ chối thành not_found. Các nhóm chạy tuần tự và đọc mọi trang.

Toàn bộ lookup của input batch phải hoàn tất, không duplicate trước ghi. Một nhóm lỗi hoặc key trùng hủy mọi ghi, kể cả các key not_found ở nhóm trước. Continue On Fail trả lỗi từng phần tử: key duplicate có count/record_ids, key khác failed; không gắn action thành công.

Batch Update chạy trước, Batch Create sau, chia Batch Size 1–500. Lỗi ghi hoặc response không khớp dừng các lô chưa thực hiện, kể cả Continue On Fail. Không rollback. Output giữ kết quả đã xác nhận, phần tử còn lại có write_status=unconfirmed_or_not_attempted. Khi throw, thông báo nhắc có thể đã ghi một phần.

Kết quả khôi phục theo khóa/ID, không dựa vào thứ tự Batch Create của server. record_index từ 0 trong mảng; pairedItem trỏ n8n item chứa mảng, không nhầm record_index thành input item index.

## Lỗi và Continue On Fail

```json
{
	"error": "Unique Key \"A001\" có 2 bản ghi trên Lark Base. Không thể xác định bản ghi cần cập nhật.",
	"unique_key": "A001",
	"duplicate_count": 2,
	"record_ids": ["rec1", "rec2"],
	"lookup_status": "duplicate"
}
```

Lookup API luôn throw khi thất bại. Chỉ ranh giới operation/node chuyển exception thành error item khi Continue On Fail. Error item không quay lại thuật toán phân loại để Create. Downstream phải tách error item, không dùng !record_id → Create.

Một input batch lỗi không khóa các n8n items còn lại khi Continue On Fail bật. Các item khác có thể được ghi; không có transaction toàn execution. Preflight duplicate đánh dấu mọi input liên quan, không tự chọn dòng thắng.

## Check Duplicates

Search toàn bảng theo field_names, đọc hết trang. Chỉ trả nhóm count > 1: `{unique_key,count,record_ids}`. Ô khóa trống không thành nhóm khóa hợp lệ. Không dùng view/Limit, không tự xóa. Scan lỗi trả lỗi thay vì danh sách duplicate thiếu. Không có snapshot; dừng writer trong lúc kiểm tra nếu cần kết quả ổn định.
