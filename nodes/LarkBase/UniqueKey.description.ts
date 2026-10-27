import type { INodeProperties } from 'n8n-workflow';
import { uniqueOperations } from './helpers/uniqueKey';

export const uniqueKeyProperties: INodeProperties[] = [
	{
		displayName: 'Chọn Unique Key Field bằng',
		name: 'uniqueKeySource',
		type: 'options',
		default: 'list',
		displayOptions: { show: { operation: uniqueOperations } },
		options: [
			{ name: 'Danh sách cột', value: 'list' },
			{ name: 'Nhập tên cột', value: 'manual' },
		],
	},
	{
		displayName: 'Unique Key Field',
		name: 'uniqueKeyField',
		type: 'options',
		default: '',
		required: true,
		displayOptions: { show: { operation: uniqueOperations, uniqueKeySource: ['list'] } },
		typeOptions: {
			loadOptionsMethod: 'getUniqueKeyFields',
			loadOptionsDependsOn: ['base', 'table', 'authentication', 'tenantAccessToken', 'platform'],
		},
		description:
			'Chọn cột Text hoặc Number làm khóa lookup chính xác. Đây không phải unique constraint của Lark Base.',
	},
	{
		displayName: 'Tên Unique Key Field',
		name: 'uniqueKeyFieldManual',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { operation: uniqueOperations, uniqueKeySource: ['manual'] } },
		description:
			'Nhập chính xác tên cột Text/Number hoặc expression. Node vẫn kiểm tra metadata khi thực thi.',
	},
	{
		displayName: 'Giá trị Unique Key',
		name: 'uniqueKeyValue',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { operation: ['deleteByUniqueKey'] } },
		description: 'Giá trị khóa của bản ghi cần xóa; không tự chọn bản ghi đầu nếu khóa bị trùng',
	},
	{
		displayName: 'Client Token (UUID v4)',
		name: 'clientToken',
		type: 'string',
		default: '',
		displayOptions: { show: { operation: ['create'] } },
		description:
			'Để trống để node tạo UUID v4 cho request. Có thể truyền UUID v4 đã lưu từ hệ thống nguồn để dùng lại đúng logical Create khi chạy lại; không tái dùng cho payload khác.',
	},
];
