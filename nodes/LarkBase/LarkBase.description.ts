import type { INodeProperties } from 'n8n-workflow';
import { filterProperties } from './Filter.description';
import { uniqueKeyProperties } from './UniqueKey.description';

const readOperations = ['list', 'search'];
const writeOperations = ['create', 'update', 'upsert', 'updateByUniqueKey'];
const batchOperations = ['batchCreate', 'batchUpdate', 'batchDelete', 'batchUpsert'];

export const properties: INodeProperties[] = [
	{
		displayName: 'Xác thực',
		name: 'authentication',
		type: 'options',
		noDataExpression: true,
		default: 'tenantToken',
		displayOptions: { show: { '@version': [2, 3] } },
		options: [
			{
				name: 'Token từ node trước',
				value: 'tenantToken',
				description:
					'Truyền tenant_access_token bằng expression, không cần credential trong node Base',
			},
			{
				name: 'Credential ứng dụng',
				value: 'appCredentials',
				description: 'Dùng credential App ID/App Secret và tự làm mới token',
			},
		],
	},
	{
		displayName: 'Tenant Access Token',
		name: 'tenantAccessToken',
		type: 'string',
		default: '={{ $json.tenant_access_token }}',
		required: true,
		typeOptions: { password: true },
		displayOptions: { show: { '@version': [2, 3], authentication: ['tenantToken'] } },
		description:
			'Token từ node Lark Access Token hoặc HTTP Request. Chỉ truyền giá trị token, không thêm Bearer. Với nhiều node liên tiếp, tham chiếu node lấy token bằng tên.',
	},
	{
		displayName: 'Nền tảng',
		name: 'platform',
		type: 'options',
		default: 'lark',
		displayOptions: { show: { '@version': [2, 3], authentication: ['tenantToken'] } },
		options: [
			{ name: 'Lark', value: 'lark' },
			{ name: 'Feishu', value: 'feishu' },
		],
		description: 'Chọn cùng nền tảng với node đã cấp token',
	},
	{
		displayName: 'Tài nguyên',
		name: 'resource',
		type: 'options',
		noDataExpression: true,
		default: 'record',
		options: [{ name: 'Record', value: 'record', description: 'Bản ghi trong bảng Lark Base' }],
	},
	{
		displayName: 'Thao tác',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['record'] } },
		default: 'list',
		options: [
			{
				name: 'Cập nhật',
				value: 'update',
				description: 'Chỉ cập nhật các cột được cung cấp',
				action: 'Cập nhật bản ghi',
			},
			{
				name: 'Cập nhật theo lô',
				value: 'batchUpdate',
				description: 'Cập nhật nhiều bản ghi theo Record ID',
				action: 'Cập nhật bản ghi theo lô',
			},
			{
				name: 'Cập nhật theo Unique Key',
				value: 'updateByUniqueKey',
				description: 'Chỉ cập nhật khi lookup tìm thấy đúng một bản ghi',
				action: 'Cập nhật bản ghi theo unique key',
			},
			{
				name: 'Kiểm tra khóa trùng',
				value: 'checkDuplicates',
				description: 'Đọc toàn bảng và trả những khóa xuất hiện nhiều lần; không tự xóa',
				action: 'Kiểm tra unique key trùng',
			},
			{
				name: 'Lấy một bản ghi',
				value: 'get',
				description: 'Lấy bản ghi theo Record ID',
				action: 'Lấy một bản ghi',
			},
			{
				name: 'Liệt kê',
				value: 'list',
				description: 'Lấy các bản ghi, tự động phân trang',
				action: 'Liệt kê bản ghi',
			},
			{
				name: 'Tạo',
				value: 'create',
				description: 'Tạo bản ghi với dữ liệu đã chuẩn hóa theo cột',
				action: 'Tạo bản ghi',
			},
			{
				name: 'Tạo theo lô',
				value: 'batchCreate',
				description: 'Tự chia lô để tạo nhiều bản ghi',
				action: 'Tạo bản ghi theo lô',
			},
			{
				name: 'Tìm kiếm',
				value: 'search',
				description: 'Lọc và sắp xếp bản ghi',
				action: 'Tìm kiếm bản ghi',
			},
			{
				name: 'Upsert',
				value: 'upsert',
				description:
					'Lookup theo khóa: tạo khi không có, cập nhật khi có đúng một; lỗi khi trùng hoặc lookup thất bại',
				action: 'Upsert bản ghi theo unique key',
			},
			{
				name: 'Upsert theo lô',
				value: 'batchUpsert',
				description: 'Kiểm tra khóa trùng, lookup toàn lô rồi chia Batch Create/Update',
				action: 'Upsert bản ghi theo lô',
			},
			{
				name: 'Xóa',
				value: 'delete',
				description: 'Xóa bản ghi theo Record ID',
				action: 'Xóa bản ghi',
			},
			{
				name: 'Xóa theo lô',
				value: 'batchDelete',
				description: 'Xóa nhiều bản ghi theo Record ID',
				action: 'Xóa bản ghi theo lô',
			},
			{
				name: 'Xóa theo Unique Key',
				value: 'deleteByUniqueKey',
				description: 'Chỉ xóa khi lookup tìm thấy đúng một bản ghi',
				action: 'Xóa bản ghi theo unique key',
			},
		],
	},
	{
		displayName: 'Base',
		name: 'base',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'https://example.larksuite.com/base/ABC123?table=tblABC123',
		description:
			'Dán URL Lark Base hoặc nhập App Token. Tự nhận bảng và view từ URL khi có. URL Wiki cần App Token của Base gốc.',
	},
	{
		displayName: 'Table',
		name: 'table',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		typeOptions: {
			loadOptionsDependsOn: ['base', 'authentication', 'tenantAccessToken', 'platform'],
		},
		description:
			'Chọn bảng từ danh sách, nhập Table ID, hoặc dùng bảng trong URL Base. Chuyển sang nhập ID khi danh sách không tải được.',
		modes: [
			{
				displayName: 'Từ danh sách',
				name: 'list',
				type: 'list',
				typeOptions: {
					searchListMethod: 'searchTables',
					searchable: true,
					searchFilterRequired: false,
				},
			},
			{
				displayName: 'Nhập ID',
				name: 'id',
				type: 'string',
				placeholder: 'tblABC123; để trống nếu URL Base đã có bảng',
			},
		],
	},
	{
		displayName: 'Record ID',
		name: 'recordId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { operation: ['get', 'update', 'delete'] } },
		description: 'ID bản ghi bắt đầu bằng rec. Có thể lấy từ kết quả Liệt kê hoặc Tạo.',
	},
	...uniqueKeyProperties,
	{
		displayName: 'Trả về tất cả',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: { show: { operation: readOperations } },
		description: 'Tự động đọc tất cả các trang dữ liệu của bảng hoặc bộ lọc',
	},
	{
		displayName: 'Giới hạn',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1, numberPrecision: 0 },
		displayOptions: { show: { operation: readOperations, returnAll: [false] } },
		description: 'Số bản ghi tối đa trả về; tự đọc nhiều trang khi cần',
	},
	{
		displayName: 'Fields (JSON)',
		name: 'fields',
		type: 'json',
		default: '{}',
		required: true,
		displayOptions: { show: { operation: writeOperations } },
		description:
			'Đối tượng có khóa là tên cột, giá trị là dữ liệu cần ghi. Hỗ trợ biểu thức trả về đối tượng. Chỉ ghi cột có trong đối tượng; null dùng để xóa giá trị.',
	},
	{
		displayName: 'Bản ghi (JSON)',
		name: 'records',
		type: 'json',
		default: '[]',
		required: true,
		displayOptions: { show: { operation: batchOperations } },
		description:
			'Tạo/Upsert: [{"fields":{...}}]; Upsert cần có Unique Key trong fields. Cập nhật: [{"record_id":"rec...","fields":{...}}]. Xóa: ["rec..."]. Hỗ trợ biểu thức trả về mảng.',
	},
	{
		displayName: 'Số bản ghi mỗi lô',
		name: 'batchSize',
		type: 'number',
		default: 500,
		typeOptions: { minValue: 1, maxValue: 500, numberPrecision: 0 },
		displayOptions: { show: { operation: batchOperations } },
		description: 'Tự chia đầu vào thành nhiều lô tuần tự, tối đa 500 bản ghi mỗi lô',
	},
	...filterProperties,
	{
		displayName: 'Bộ lọc (JSON)',
		name: 'filter',
		type: 'json',
		default: '{}',
		displayOptions: { show: { operation: ['search'] }, hide: { filterMode: ['builder'] } },
		description:
			'Điều kiện Lark Search: {"conjunction":"and","conditions":[{"field_name":"Name","operator":"is","value":["An"]}]}. Để {} nếu không lọc.',
	},
	{
		displayName: 'Tùy chọn',
		name: 'options',
		type: 'collection',
		default: {},
		placeholder: 'Thêm tùy chọn',
		displayOptions: { show: { operation: readOperations } },
		options: [
			{
				displayName: 'View',
				name: 'viewId',
				type: 'string',
				default: '',
				description:
					'View ID bắt đầu bằng vew. Để trống để dùng view trong URL Base; chỉ áp dụng khi bảng trùng với bảng trong URL.',
			},
			{
				displayName: 'Sắp xếp (JSON)',
				name: 'sort',
				type: 'json',
				default: '[]',
				description:
					'Mảng quy tắc theo tên cột, ví dụ [{"field_name":"Name","desc":false}]. desc=true để giảm dần.',
			},
		],
	},
];
