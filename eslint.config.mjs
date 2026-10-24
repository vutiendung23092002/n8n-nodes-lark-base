import { config } from '@n8n/node-cli/eslint';

export default [
	...config,
	{ ignores: ['dist/**', 'node_modules/**'] },
	{
		files: ['nodes/LarkBase/Filter.description.ts'],
		// Giữ thứ tự chọn cột → phép lọc → giá trị. API lọc cần tên cột, không nhận ID;
		// nhãn/hướng dẫn tiếng Việt và chế độ nhập tên riêng phản ánh đúng hợp đồng đó.
		rules: {
			'n8n-nodes-base/node-param-fixed-collection-type-unsorted-items': 'off',
			'n8n-nodes-base/node-param-display-name-wrong-for-dynamic-options': 'off',
			'n8n-nodes-base/node-param-description-wrong-for-dynamic-options': 'off',
		},
	},
	{
		files: ['credentials/VutiendungLarkApi.credentials.ts'],
		// Hậu tố (Vutiendung) phân biệt với credential Lark API của package khác.
		rules: { 'n8n-nodes-base/cred-class-field-display-name-missing-api': 'off' },
	},
	{
		files: ['nodes/LarkAccessToken/LarkAccessToken.node.ts'],
		// Node cấp token trả dữ liệu xác thực cho workflow, không đưa vào danh sách công cụ của AI Agent.
		rules: { '@n8n/community-nodes/node-usable-as-tool': 'off' },
	},
	{
		files: ['nodes/LarkBase/v1/LarkBase.node.ts'],
		// Entry ở thư mục phiên bản có đường dẫn mới để không dùng lại module cũ trong cache.
		// Giữ tên class/file và description.name để không đổi định danh workflow đã lưu.
		rules: { 'n8n-nodes-base/node-dirname-against-convention': 'off' },
	},
	{
		files: ['tests/**/*.ts'],
		// Bộ kiểm thử không được đóng gói; có thể sử dụng trình chạy test tích hợp của Node.js.
		rules: { '@n8n/community-nodes/no-restricted-imports': 'off' },
	},
	{
		// Các quy tắc câu chữ tiếng Anh xung đột với giao diện tiếng Việt của dự án.
		files: ['credentials/**/*.ts', 'nodes/**/*.ts'],
		rules: {
			'n8n-nodes-base/node-param-display-name-miscased': 'off',
			'n8n-nodes-base/node-param-description-boolean-without-whether': 'off',
			'n8n-nodes-base/node-param-description-miscased': 'off',
			'n8n-nodes-base/node-param-options-name-wrong-for-get-all': 'off',
			'n8n-nodes-base/node-param-operation-option-action-miscased': 'off',
			'n8n-nodes-base/node-param-operation-option-description-wrong': 'off',
			'n8n-nodes-base/node-param-description-wrong-for-return-all': 'off',
			'n8n-nodes-base/node-param-description-wrong-for-limit': 'off',
		},
	},
];
