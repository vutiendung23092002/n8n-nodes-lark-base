import type { INodeProperties } from 'n8n-workflow';
import { datePresets, filterOperators } from './helpers/filterBuilder';

const needsValue = { hide: { operator: ['isEmpty', 'isNotEmpty'] } };

export const filterProperties: INodeProperties[] = [
	{
		displayName: 'Cách nhập bộ lọc',
		name: 'filterMode',
		type: 'options',
		noDataExpression: true,
		default: 'builder',
		displayOptions: { show: { operation: ['search'], '@version': [3] } },
		options: [
			{ name: 'Chọn điều kiện', value: 'builder' },
			{ name: 'JSON nâng cao', value: 'json' },
		],
	},
	{
		displayName: 'Kết hợp điều kiện',
		name: 'filterConjunction',
		type: 'options',
		default: 'and',
		displayOptions: { show: { operation: ['search'], '@version': [3], filterMode: ['builder'] } },
		options: [
			{ name: 'Tất cả điều kiện (AND)', value: 'and' },
			{ name: 'Bất kỳ điều kiện nào (OR)', value: 'or' },
		],
	},
	{
		displayName: 'Bộ lọc',
		name: 'filterConditions',
		type: 'fixedCollection',
		default: {},
		placeholder: 'Thêm điều kiện',
		typeOptions: { multipleValues: true },
		displayOptions: { show: { operation: ['search'], '@version': [3], filterMode: ['builder'] } },
		options: [
			{
				displayName: 'Điều kiện',
				name: 'condition',
				values: [
					{
						displayName: 'Chọn cột bằng',
						name: 'fieldSource',
						type: 'options',
						default: 'list',
						options: [
							{ name: 'Danh sách cột', value: 'list' },
							{ name: 'Nhập tên cột', value: 'manual' },
						],
					},
					{
						displayName: 'Cột',
						name: 'fieldName',
						type: 'options',
						default: '',
						required: true,
						displayOptions: { show: { fieldSource: ['list'] } },
						typeOptions: {
							loadOptionsMethod: 'getFilterFields',
							loadOptionsDependsOn: [
								'base',
								'table',
								'authentication',
								'tenantAccessToken',
								'platform',
							],
						},
						description:
							'Chọn cột từ bảng. Chạy node lấy token trước nếu dùng token từ node trước.',
					},
					{
						displayName: 'Tên cột',
						name: 'fieldNameManual',
						type: 'string',
						default: '',
						required: true,
						displayOptions: { show: { fieldSource: ['manual'] } },
						description: 'Nhập chính xác tên cột trong Lark, không nhập Field ID',
					},
					{
						displayName: 'Phép lọc',
						name: 'operator',
						type: 'options',
						default: 'is',
						options: filterOperators,
						description:
							'Cột ngày hỗ trợ là, lớn hơn, nhỏ hơn, rỗng và không rỗng. Các phép so sánh phụ thuộc loại cột.',
					},
					{
						displayName: 'Kiểu giá trị',
						name: 'valueMode',
						type: 'options',
						default: 'single',
						displayOptions: needsValue,
						options: [
							{ name: 'Một giá trị', value: 'single' },
							{ name: 'Nhiều giá trị (mỗi dòng một giá trị)', value: 'multiple' },
							{ name: 'Ngày', value: 'date' },
						],
					},
					{
						displayName: 'Giá trị',
						name: 'singleValue',
						type: 'string',
						default: '',
						displayOptions: { ...needsValue, show: { valueMode: ['single'] } },
						description:
							'Hỗ trợ expression. Với cột người, nhập open_id; ô đánh dấu dùng true hoặc false.',
					},
					{
						displayName: 'Các giá trị',
						name: 'multipleValues',
						type: 'string',
						default: '',
						typeOptions: { rows: 5 },
						displayOptions: { ...needsValue, show: { valueMode: ['multiple'] } },
						placeholder: 'Shop A\nShop B',
						description:
							'Mỗi giá trị một dòng; dấu phẩy được giữ nguyên. Với mảng từ node trước, dùng expression .join("\\n"). Mảng được gửi theo quy tắc của phép lọc và loại cột Lark.',
					},
					{
						displayName: 'Mốc ngày',
						name: 'datePreset',
						type: 'options',
						default: 'ExactDate',
						options: datePresets,
						displayOptions: { ...needsValue, show: { valueMode: ['date'] } },
					},
					{
						displayName: 'Ngày cụ thể',
						name: 'dateValue',
						type: 'dateTime',
						default: '',
						displayOptions: {
							...needsValue,
							show: { valueMode: ['date'], datePreset: ['ExactDate'] },
						},
						description:
							'Ngày giờ không có múi giờ từ ô lịch được hiểu theo múi giờ workflow. Expression có Z hoặc offset giữ nguyên thời điểm. Node tự chuyển sang timestamp mili giây của Lark.',
					},
				],
			},
		],
	},
];
