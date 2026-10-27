# Nguồn chính thức đã đối chiếu

## Bổ sung an toàn dữ liệu — 27/10/2026

Đã đọc SDK Go chính thức tại commit `db9f52d0a88e3f5e4ed81bb34d71a28e3f5608fa`:

- [CreateAppTableRecordReqBuilder.ClientToken](https://github.com/larksuite/oapi-sdk-go/blob/db9f52d0a88e3f5e4ed81bb34d71a28e3f5608fa/service/bitable/v1/model.go): query client_token dạng UUID v4, dùng cho request idempotent. Có IgnoreConsistencyCheck mặc định false.
- Cùng tệp có BatchCreateAppTableRecordReqBuilder.ClientToken và IgnoreConsistencyCheck, xác nhận hỗ trợ Batch Create, không suy từ endpoint Create đơn.
- SearchAppTableRecordReqBody/FilterInfo xác nhận conjunction/conditions, field_names, giá trị điều kiện là mảng chuỗi; Search response có items/has_more/page_token/total.
- Các kiểu field Text=1, Number=2; mô tả AppTableRecord xác nhận fields và record_id. Logic parse Text rich text đối chiếu thêm [cấu trúc record chính thức](https://github.com/larksuite/openclaw-lark/blob/main/skills/feishu-bitable/references/record-values.md).

Trang [Create](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/create), [Batch Create](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/batch_create), [Search](https://open.feishu.cn/document/docs/bitable-v1/app-table-record/search) không trả nội dung qua công cụ đọc do JavaScript; SDK chính thức được dùng để xác minh chữ ký request. Không đưa SDK vào dependency runtime.

Không xác minh được TTL idempotency hoặc giải pháp atomic unique constraint từ nguồn chính thức; không hứa các bảo đảm đó. Nhóm OR giới hạn nội bộ 10 điều kiện/16.000 byte để tránh dựa vào mức tối đa chưa xác minh; nếu API từ chối payload thì fail, không Create. WriteConflict 1254291 không được retry vì chưa có bằng chứng chính thức rằng phát lại mọi loại write với lỗi này an toàn. Mã rate limit 99991400/1254290 đã được transport xử lý; chỉ phân loại lại theo mức an toàn request.

Ngày khảo sát: 24/10/2026. Một số trang Lark/Feishu cần JavaScript và không trả nội dung API cho công cụ đọc; các chữ ký request/response được đối chiếu thêm bằng SDK do Lark phát hành, không suy diễn từ bài hướng dẫn cộng đồng.

| Nội dung                                                                      | Nguồn                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tooling chính thức, create-node, build, lint, dev                             | [Tài liệu n8n](https://docs.n8n.io/connect/create-nodes/build-your-node/using-the-n8n-node-tool.md)                                                                                                                                   |
| TypeScript/manifest và cấu hình mẫu                                           | Template `programmatic/example` trong `@n8n/node-cli`; đã đọc template được cài qua npm                                                                                                                                               |
| Tổng quan Base, collaborator, URL/token, giới hạn Lark                        | [Base Overview](https://open.larksuite.com/document/server-docs/docs/bitable-v1/notification)                                                                                                                                         |
| Search và phân trang                                                          | [Search records](https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/reference/bitable-v1/app-table-record/search)                                                                                                              |
| Lấy record                                                                    | [Get record](https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/reference/bitable-v1/app-table-record/get)                                                                                                                     |
| Field metadata                                                                | [List fields](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-field/list)                                                                                                                                       |
| Token của ứng dụng nội bộ                                                     | [Tenant access token](https://open.feishu.cn/document/server-docs/authentication-management/access-token/tenant_access_token_internal)                                                                                                |
| Request/response Record, Table, Field, các kiểu field và ghi tăng dần         | [SDK Node.js chính thức](https://github.com/larksuite/node-sdk), package `@larksuiteoapi/node-sdk@1.76.0`, các phần `bitable.appTable`, `appTableField`, `appTableRecord` trong `types/index.d.ts` và URL/method trong `lib/index.js` |
| Mã tenant token không hợp lệ `99991663`, access token không hợp lệ `99991671` | [Các hằng số SDK Go chính thức](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/core/constants.go)                                                                                                                              |
| Tên scope `bitable:app`, `bitable:app:readonly`                               | [Hướng dẫn Base chính thức](https://open.feishu.cn/document/base-extensions/base-table-view-extension-development-guide)                                                                                                              |
| Scope quản lý Base của Lark                                                   | [Giải pháp Lark Base và Power BI](https://open.larksuite.com/solutions/detail/oa?lang=zh-CN)                                                                                                                                          |
| Thêm ứng dụng vào tài liệu qua Add applications                               | [Lark: quyền truy cập tài liệu](https://open.larksuite.com/document/ukTMukTMukTM/uUDN04SN0QjL1QDN/docs-v1)                                                                                                                            |

## Quyết định từ nguồn

Bổ sung cho 0.3.1: [ParameterInput.vue của n8n](https://github.com/n8n-io/n8n/blob/master/packages/frontend/editor-ui/src/features/ndv/parameters/components/ParameterInput.vue) dùng value-format YYYY-MM-DDTHH:mm:ss cho dateTime; [NodeExecutionContext](https://github.com/n8n-io/n8n/blob/master/packages/core/src/execution-engine/node-execution-context/node-execution-context.ts) cung cấp getTimezone() từ workflow. [Luxon 3.7.2](https://moment.github.io/luxon/api-docs/index.html#datetimefromobject) hỗ trợ parse theo zone và getPossibleOffsets để phát hiện giờ DST bị lặp. Dùng dependency trực tiếp, không dựa vào hoisting của host.

Bổ sung cho bộ lọc trực quan 0.3.0: [ví dụ chính thức của Lark](https://github.com/larksuite/openclaw-lark/blob/main/skills/feishu-bitable/references/examples.md#operator-类型10-种) liệt kê 10 operator, điều kiện ngày, mảng giá trị và các mốc ngày tương đối; [ghi chú của Lark](https://github.com/larksuite/openclaw-lark/blob/main/skills/feishu-bitable/SKILL.md#场景-3-筛选查询高级筛选) yêu cầu `value: []` cho isEmpty/isNotEmpty. Không hiển thị like/in trong builder. Parser JSON cũ giữ các tên cũ đã chấp nhận để không làm hỏng workflow; API vẫn quyết định hỗ trợ thực tế.

- SDK đánh dấu GET List records là endpoint lịch sử, khuyến nghị Search. UI Liệt kê gọi POST Search với body `{}` hoặc view/sort, thay vì dùng GET cũ.
- Search hỗ trợ tối đa 500 record/trang; cursor đặt ở query, filter/sort/view đặt trong body. Giá trị điều kiện filter là mảng chuỗi có quy tắc theo loại cột.
- Tài liệu tổng quan Lark nêu 500 record/batch. SDK Feishu mới nêu tới 1.000 cho Batch Create và 500 cho Batch Delete. MVP chọn giới hạn an toàn 500 cho cả ba thao tác, có tham số cho phép giảm.
- SDK xác nhận Update là cập nhật tăng dần; chỉ gửi field cần đổi, null để xóa giá trị.
- Tenant access token đại diện ứng dụng; scope API không tự làm ứng dụng thành collaborator của Base. Quyền nâng cao có thể làm kết quả Search rỗng.
- Không lấy app token trực tiếp từ đường dẫn Wiki: nguồn nêu phải resolve node Wiki để lấy obj_token. Vì resolver nằm ngoài MVP, UI báo rõ giới hạn này.

Không đưa SDK Lark vào runtime dependency: node chỉ cần HTTP helper của n8n; SDK được dùng để xác minh hợp đồng API.
