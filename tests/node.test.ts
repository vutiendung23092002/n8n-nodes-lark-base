import assert from 'node:assert/strict';
import { test } from 'node:test';
import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
} from 'n8n-workflow';
// Đuôi .ts tránh Node chọn nhầm tệp metadata .node.json cùng tên.
import { LarkBase } from '../nodes/LarkBase/v1/LarkBase.node.ts';
import { searchTables } from '../nodes/LarkBase/methods/listSearch';
import { getFilterFields } from '../nodes/LarkBase/methods/loadOptions';

const ok = (data: unknown) => ({ statusCode: 200, headers: {}, body: { code: 0, data } });

function harness(
	parameters: IDataObject,
	http: (options: IHttpRequestOptions) => Promise<unknown>,
	{ count = 1, continueOnFail = false, version = 1 } = {},
) {
	const context = {
		getInputData: () => Array.from({ length: count }, (_, i) => ({ json: { index: i } })),
		getTimezone: () => 'Asia/Ho_Chi_Minh',
		getNode: () => ({
			name: 'Lark Base',
			type: '@vutiendung/n8n-nodes-lark-base.larkBase',
			typeVersion: version,
			position: [0, 0],
			parameters: {},
		}),
		getNodeParameter: (
			name: string,
			_item: number,
			fallback?: unknown,
			options?: { extractValue?: boolean },
		) => {
			const value = {
				resource: 'record',
				operation: 'list',
				base: 'https://example.larksuite.com/base/ABC?table=tbl1&view=vew1',
				table: { mode: 'id', value: '' },
				...parameters,
			}[name];
			if (options?.extractValue && value && typeof value === 'object')
				return (value as { value: string }).value;
			return value ?? fallback;
		},
		getCredentials: async () => ({ appId: 'cli_test', appSecret: 'secret-test', platform: 'lark' }),
		continueOnFail: () => continueOnFail,
		helpers: {
			httpRequest: async (options: IHttpRequestOptions) => {
				if (options.url.endsWith('/tenant_access_token/internal')) {
					return {
						statusCode: 200,
						headers: {},
						body: { code: 0, tenant_access_token: 'token-test', expire: 7200 },
					};
				}
				return await http(options);
			},
		},
	};
	return context as unknown as IExecuteFunctions;
}

test('Luồng List phân trang, trả record riêng và giữ pairedItem theo đầu vào', async () => {
	const requests: IHttpRequestOptions[] = [];
	const context = harness(
		{ returnAll: true },
		async (options) => {
			requests.push(options);
			assert.equal(options.method, 'POST');
			assert.equal(options.url.endsWith('/tables/tbl1/records/search'), true);
			assert.equal(options.headers?.Authorization, 'Bearer token-test');
			assert.deepEqual(options.body, { view_id: 'vew1' });
			return options.qs?.page_token
				? ok({ items: [{ record_id: 'rec2', fields: { Tên: 'Bình' } }], has_more: false })
				: ok({
						items: [{ record_id: 'rec1', fields: { Tên: 'An' } }],
						has_more: true,
						page_token: 'trang2',
					});
		},
		{ count: 2 },
	);
	const [items] = await new LarkBase().execute.call(context);
	assert.equal(items.length, 4);
	assert.deepEqual(
		items.map((item) => item.pairedItem),
		[{ item: 0 }, { item: 0 }, { item: 1 }, { item: 1 }],
	);
	assert.deepEqual(items[1].json, { record_id: 'rec2', fields: { Tên: 'Bình' } });
	assert.equal(requests.length, 4);
});

test('List Limit được áp dụng trên đầu ra n8n', async () => {
	const [items] = await new LarkBase().execute.call(
		harness({ returnAll: false, limit: 1 }, async (options) => {
			assert.equal(options.qs?.page_size, 1);
			return ok({
				items: [
					{ record_id: 'rec1', fields: {} },
					{ record_id: 'rec2', fields: {} },
				],
				has_more: true,
			});
		}),
	);
	assert.equal(items.length, 1);
});

test('Return All với Base lớn không vượt giới hạn số đối số của hàm', async () => {
	const total = 130001;
	let fetched = 0;
	const [items] = await new LarkBase().execute.call(
		harness({ returnAll: true }, async (options) => {
			const size = Math.min(Number(options.qs?.page_size), total - fetched);
			const records = Array.from({ length: size }, (_, i) => ({
				record_id: `rec${fetched + i}`,
				fields: {},
			}));
			fetched += size;
			return ok({ items: records, has_more: fetched < total, page_token: `trang${fetched}` });
		}),
	);
	assert.equal(items.length, total);
	assert.equal(items.at(-1)?.json.record_id, `rec${total - 1}`);
	assert.deepEqual(items.at(-1)?.pairedItem, { item: 0 });
});

test('Create/Update dùng metadata một lần và chỉ gửi field được chỉ định', async () => {
	for (const operation of ['create', 'update']) {
		let metadataCalls = 0;
		let writes = 0;
		const [items] = await new LarkBase().execute.call(
			harness(
				{ operation, recordId: 'rec1', fields: { Tên: 'An' } },
				async (options) => {
					if (options.url.endsWith('/fields')) {
						metadataCalls++;
						return ok({
							items: [
								{ field_id: 'fld1', field_name: 'Tên', type: 1 },
								{ field_id: 'fld2', field_name: 'Khác', type: 1 },
							],
							has_more: false,
						});
					}
					writes++;
					assert.deepEqual(options.body, { fields: { Tên: 'An' } });
					assert.equal(options.method, operation === 'create' ? 'POST' : 'PUT');
					assert.equal(options.qs?.user_id_type, 'open_id');
					return ok({ record: { record_id: 'rec1', fields: { Tên: 'An' } } });
				},
				{ count: 2 },
			),
		);
		assert.equal(items.length, 2);
		assert.equal(metadataCalls, 1);
		assert.equal(writes, 2);
	}
});

test('Get và Delete dùng đúng endpoint và trả trạng thái xóa', async () => {
	for (const operation of ['get', 'delete']) {
		const [items] = await new LarkBase().execute.call(
			harness({ operation, recordId: 'rec1' }, async (options) => {
				assert.equal(options.url.endsWith('/records/rec1'), true);
				assert.equal(options.method, operation === 'get' ? 'GET' : 'DELETE');
				return ok(
					operation === 'get'
						? { record: { record_id: 'rec1', fields: { Tên: 'An' } } }
						: { record_id: 'rec1', deleted: true },
				);
			}),
		);
		assert.equal(items[0].json.record_id, 'rec1');
		if (operation === 'delete') assert.equal(items[0].json.deleted, true);
	}
});

test('Search gửi filter/sort/view đúng vị trí và không gửi cursor trong body', async () => {
	const filter = {
		conjunction: 'and',
		conditions: [{ field_name: 'Tên', operator: 'is', value: ['An'] }],
	};
	const sort = [{ field_name: 'Tên', desc: true }];
	const [items] = await new LarkBase().execute.call(
		harness(
			{ operation: 'search', filter, options: { sort, viewId: 'vew2' }, returnAll: true },
			async (options) => {
				assert.deepEqual(options.body, { filter, sort, view_id: 'vew2' });
				assert.equal(options.qs?.page_size, 500);
				return ok({ items: [{ record_id: 'rec1', fields: {} }], has_more: false });
			},
		),
	);
	assert.equal(items.length, 1);
});

test('Search version 3 tạo bộ lọc AND theo item, dùng cùng filter khi phân trang', async () => {
	const requests: IHttpRequestOptions[] = [];
	const context = harness(
		{
			operation: 'search',
			authentication: 'tenantToken',
			tenantAccessToken: 'provided-token',
			returnAll: true,
			filterConjunction: 'and',
			filterConditions: {
				condition: [
					{
						fieldName: 'Shop',
						operator: 'contains',
						valueMode: 'multiple',
						multipleValues: 'A\nB',
					},
					{ fieldName: 'Ghi chú', operator: 'isEmpty', singleValue: 'bỏ giá trị cũ' },
				],
			},
		},
		async (options) => {
			assert.equal(options.headers?.Authorization, 'Bearer provided-token');
			if (options.url.endsWith('/fields'))
				return ok({
					items: [
						{ field_id: 'fldShop', field_name: 'Shop', type: 1 },
						{ field_id: 'fldNotes', field_name: 'Ghi chú', type: 1 },
					],
					has_more: false,
				});
			requests.push(options);
			return ok({
				items: [{ record_id: options.qs?.page_token ? 'rec2' : 'rec1', fields: {} }],
				has_more: !options.qs?.page_token,
				page_token: 'next',
			});
		},
		{ version: 3 },
	);
	context.getCredentials = async () => {
		throw new Error('Không đọc credential');
	};
	const [items] = await new LarkBase().execute.call(context);
	assert.equal(items.length, 2);
	assert.equal(requests.length, 2);
	for (const request of requests)
		assert.deepEqual(request.body, {
			view_id: 'vew1',
			filter: {
				conjunction: 'and',
				conditions: [{ field_name: 'Ghi chú', operator: 'isEmpty', value: [] }],
				children: [
					{
						conjunction: 'or',
						conditions: [
							{ field_name: 'Shop', operator: 'contains', value: ['A'] },
							{ field_name: 'Shop', operator: 'contains', value: ['B'] },
						],
					},
				],
			},
		});
});

test('Search nhiều từ ghi chú không gửi mảng contains sai; Chứa OR và Không chứa AND', async () => {
	const records = [
		{ record_id: 'rec1', fields: { 'Ghi chú để in': 'bù đơn lần trước' } },
		{ record_id: 'rec2', fields: { 'Ghi chú để in': 'giao thiếu hàng' } },
		{ record_id: 'rec3', fields: { 'Ghi chú để in': 'sai địa chỉ' } },
		{ record_id: 'rec4', fields: { 'Ghi chú để in': 'đơn bình thường' } },
		{ record_id: 'rec5', fields: { 'Ghi chú để in': 'bù đơn vì giao thiếu' } },
	];
	for (const operator of ['contains', 'doesNotContain']) {
		const [items] = await new LarkBase().execute.call(
			harness(
				{
					operation: 'search',
					authentication: 'appCredentials',
					returnAll: true,
					filterConditions: {
						condition: [
							{
								fieldName: 'Ghi chú để in',
								operator,
								valueMode: 'multiple',
								multipleValues: 'bù đơn\nthiếu\nsai',
							},
						],
					},
				},
				async (options) => {
					if (options.url.endsWith('/fields'))
						return ok({
							items: [{ field_id: 'fldNotes', field_name: 'Ghi chú để in', type: 1 }],
							has_more: false,
						});
					assert.equal(options.url.endsWith('/records/search'), true);
					const filter = (options.body as IDataObject).filter as {
						conjunction: string;
						conditions: Array<{ value: string[] }>;
					};
					assert.equal(filter.conditions.length, 3);
					for (const condition of filter.conditions) assert.equal(condition.value.length, 1);
					assert.equal(filter.conjunction, operator === 'contains' ? 'or' : 'and');
					const matches = records.filter((record) => {
						const results = filter.conditions.map(({ value }) => {
							const contains = record.fields['Ghi chú để in'].includes(value[0]);
							return operator === 'contains' ? contains : !contains;
						});
						return filter.conjunction === 'or' ? results.some(Boolean) : results.every(Boolean);
					});
					return ok({ items: matches, has_more: false });
				},
				{ version: 3 },
			),
		);
		assert.deepEqual(
			items.map(({ json }) => json.record_id),
			operator === 'contains' ? ['rec1', 'rec2', 'rec3', 'rec5'] : ['rec4'],
		);
	}
});

test('Search version 3 cho chọn JSON nâng cao; version 2 không tự đổi bộ lọc cũ', async () => {
	const filter = {
		conjunction: 'or',
		children: [
			{ conjunction: 'and', conditions: [{ field_name: 'Shop', operator: 'is', value: ['A'] }] },
		],
	};
	for (const version of [2, 3]) {
		const context = harness(
			{
				operation: 'search',
				authentication: 'appCredentials',
				filter,
				filterMode: version === 2 ? 'builder' : 'json',
			},
			async (options) => {
				assert.equal(options.url.endsWith('/records/search'), true);
				assert.deepEqual((options.body as IDataObject).filter, filter);
				return ok({ items: [], has_more: false });
			},
			{ version },
		);
		await new LarkBase().execute.call(context);
	}
});

test('Search nhận ngày giờ từ ô lịch và truyền múi giờ workflow tới payload Lark', async () => {
	let searches = 0;
	const context = harness(
		{
			operation: 'search',
			authentication: 'appCredentials',
			filterConditions: {
				condition: [
					{
						fieldName: 'Ngày tạo đơn',
						operator: 'isGreater',
						valueMode: 'date',
						datePreset: 'ExactDate',
						dateValue: '2026-01-02T00:00:00',
					},
				],
			},
		},
		async (options) => {
			if (options.url.endsWith('/fields'))
				return ok({
					items: [{ field_id: 'fldCreated', field_name: 'Ngày tạo đơn', type: 5 }],
					has_more: false,
				});
			searches++;
			assert.deepEqual((options.body as IDataObject).filter, {
				conjunction: 'and',
				conditions: [
					{
						field_name: 'Ngày tạo đơn',
						operator: 'isGreater',
						value: ['ExactDate', String(Date.parse('2026-01-01T17:00:00Z'))],
					},
				],
			});
			return ok({ items: [{ record_id: 'rec123', fields: {} }], has_more: false });
		},
		{ version: 3 },
	);
	const [items] = await new LarkBase().execute.call(context);
	assert.equal(searches, 1);
	assert.equal(items[0].json.record_id, 'rec123');
});

test('Bộ lọc sai không gọi Search và tuân theo Continue On Fail', async () => {
	let searches = 0;
	const context = harness(
		{
			operation: 'search',
			authentication: 'appCredentials',
			filterConditions: {
				condition: [{ fieldName: 'Cột đã xóa', operator: 'is', singleValue: 'A' }],
			},
		},
		async (options) => {
			if (options.url.endsWith('/fields')) return ok({ items: [], has_more: false });
			searches++;
			return ok({ items: [], has_more: false });
		},
		{ version: 3, continueOnFail: true },
	);
	const [items] = await new LarkBase().execute.call(context);
	assert.equal(searches, 0);
	assert.match(items[0].json.error as string, /Điều kiện lọc 1.*Không tìm thấy/);
	assert.deepEqual(items[0].pairedItem, { item: 0 });
});

test('Chọn cột tải mọi trang metadata, đúng bảng và chế độ token/credential', async () => {
	for (const authentication of ['tenantToken', 'appCredentials']) {
		let pages = 0;
		const parameters: Record<string, unknown> = {
			base: 'https://example.larksuite.com/base/ABC?table=tblOld',
			table: 'tblSelected',
			authentication,
			tenantAccessToken: 'provided-token',
		};
		const context = harness(
			{},
			async (options) => {
				assert.equal(options.url.endsWith('/tables/tblSelected/fields'), true);
				assert.equal(
					options.headers?.Authorization,
					authentication === 'tenantToken' ? 'Bearer provided-token' : 'Bearer token-test',
				);
				pages++;
				return options.qs?.page_token
					? ok({ items: [{ field_id: 'fld2', field_name: 'Nhãn', type: 4 }], has_more: false })
					: ok({
							items: [{ field_id: 'fld1', field_name: 'Shop', type: 1, ui_type: 'Text' }],
							has_more: true,
							page_token: 'next',
						});
			},
			{ version: 3 },
		) as unknown as ILoadOptionsFunctions;
		context.getNodeParameter = ((name: string, fallback?: unknown) =>
			parameters[name] ?? fallback) as ILoadOptionsFunctions['getNodeParameter'];
		const result = await getFilterFields.call(context);
		assert.deepEqual(
			result.map(({ name, value }) => ({ name, value })),
			[
				{ name: 'Shop', value: 'Shop' },
				{ name: 'Nhãn', value: 'Nhãn' },
			],
		);
		assert.equal(pages, 2);
	}
});

test('Đổi bảng sẽ bỏ view từ URL để tránh dùng nhầm view của bảng cũ', async () => {
	await new LarkBase().execute.call(
		harness({ table: { mode: 'list', value: 'tbl2' } }, async (options) => {
			assert.equal(options.url.includes('/tables/tbl2/'), true);
			assert.deepEqual(options.body, {});
			return ok({ items: [], has_more: false });
		}),
	);
});

test('Continue On Fail trả lỗi theo item, dừng đúng convention khi tắt', async () => {
	const params = { operation: 'get', recordId: 'ID-sai' };
	const http = async () => {
		throw new Error('Không được gọi HTTP');
	};
	const [items] = await new LarkBase().execute.call(
		harness(params, http, { count: 2, continueOnFail: true }),
	);
	assert.equal(items.length, 2);
	assert.match(items[1].json.error as string, /ID không hợp lệ/);
	assert.deepEqual(items[1].pairedItem, { item: 1 });
	await assert.rejects(new LarkBase().execute.call(harness(params, http)), /ID không hợp lệ/);
});

test('Lỗi credential cũng đi qua Continue On Fail', async () => {
	const context = harness({}, async () => ok({}), { continueOnFail: true });
	context.getCredentials = async <T extends object>() => ({ appId: '', appSecret: '' }) as T;
	const [items] = await new LarkBase().execute.call(context);
	assert.match(items[0].json.error as string, /App ID.*App Secret/);
});

test('Dynamic selector phân trang, hiển thị tên và giữ ID nội bộ', async () => {
	let count = 0;
	const context = harness({}, async (options) => {
		count++;
		assert.equal(options.url.endsWith('/apps/ABC/tables'), true);
		return options.qs?.page_token
			? ok({ items: [{ name: 'Khách hàng', table_id: 'tbl2' }], has_more: false })
			: ok({
					items: [{ name: 'Đơn hàng', table_id: 'tbl1' }],
					has_more: true,
					page_token: 'trang2',
				});
	}) as unknown as ILoadOptionsFunctions;
	const first = await searchTables.call(context);
	assert.deepEqual(first, {
		results: [{ name: 'Đơn hàng', value: 'tbl1' }],
		paginationToken: 'trang2',
	});
	const second = await searchTables.call(context, undefined, first.paginationToken);
	assert.deepEqual(second.results, [{ name: 'Khách hàng', value: 'tbl2' }]);
	const filtered = await searchTables.call(context, 'khách');
	assert.deepEqual(filtered.results, [{ name: 'Khách hàng', value: 'tbl2' }]);
	assert.equal(count, 4);
});

test('Base version 2 dùng token được truyền vào, không gọi credential hoặc endpoint cấp token', async () => {
	let calls = 0;
	const context = harness(
		{ tenantAccessToken: 'provided-token', platform: 'feishu' },
		async (options) => {
			calls++;
			assert.equal(options.url.startsWith('https://open.feishu.cn/open-apis/bitable/'), true);
			assert.equal(options.headers?.Authorization, 'Bearer provided-token');
			return ok({ items: [{ record_id: 'rec1', fields: {} }], has_more: false });
		},
		{ version: 2 },
	);
	context.getCredentials = async () => {
		throw new Error('Không được gọi credential.');
	};
	const [result] = await new LarkBase().execute.call(context);
	assert.equal(calls, 1);
	assert.equal(result[0].json.record_id, 'rec1');
	assert.equal(JSON.stringify(result).includes('provided-token'), false);
});

test('Token khác theo từng input không bị giữ lại từ item đầu tiên', async () => {
	const tokens: unknown[] = [];
	const context = harness(
		{},
		async (options) => {
			tokens.push(options.headers?.Authorization);
			return ok({ items: [{ record_id: 'rec1', fields: {} }] });
		},
		{ version: 2, count: 2 },
	);
	const getParameter = context.getNodeParameter.bind(context);
	context.getNodeParameter = ((
		name: string,
		index: number,
		fallback?: unknown,
		options?: object,
	) =>
		name === 'tenantAccessToken'
			? `token${index}`
			: getParameter(name, index, fallback, options)) as IExecuteFunctions['getNodeParameter'];
	context.getCredentials = async () => {
		throw new Error('Không được gọi credential.');
	};
	const [result] = await new LarkBase().execute.call(context);
	assert.deepEqual(tokens, ['Bearer token0', 'Bearer token1']);
	assert.equal(result.length, 2);
});

test('Token ngoài hết hạn không tự lấy token mới bằng App Secret', async () => {
	let calls = 0;
	const context = harness(
		{ tenantAccessToken: 'provided-token' },
		async () => {
			calls++;
			return {
				statusCode: 400,
				headers: {},
				body: { code: 99991663, msg: 'invalid provided-token' },
			};
		},
		{ version: 2, continueOnFail: true },
	);
	context.getCredentials = async () => {
		throw new Error('Không được gọi credential.');
	};
	const [result] = await new LarkBase().execute.call(context);
	assert.equal(calls, 1);
	assert.match(result[0].json.error as string, /chạy lại node Lark Access Token/i);
	assert.equal(JSON.stringify(result).includes('provided-token'), false);
});

test('Base báo lỗi rõ khi token rỗng hoặc có Bearer, không gửi HTTP', async () => {
	for (const token of ['', 'Bearer abc', 'abc def']) {
		const context = harness(
			{ tenantAccessToken: token },
			async () => {
				throw new Error('Không được gọi HTTP.');
			},
			{ version: 2, continueOnFail: true },
		);
		const [result] = await new LarkBase().execute.call(context);
		assert.match(result[0].json.error as string, /Tenant Access Token/);
	}
});

test('Base version 2 có thể chọn lại credential ứng dụng', async () => {
	let credentialCalls = 0;
	const context = harness(
		{ authentication: 'appCredentials' },
		async () => ok({ items: [{ record_id: 'rec1', fields: {} }] }),
		{ version: 2 },
	);
	const getCredential = context.getCredentials.bind(context);
	context.getCredentials = (async (...args: Parameters<IExecuteFunctions['getCredentials']>) => {
		assert.equal(args[0], 'vutiendungLarkApi');
		credentialCalls++;
		return await getCredential(...args);
	}) as IExecuteFunctions['getCredentials'];
	const [result] = await new LarkBase().execute.call(context);
	assert.equal(credentialCalls, 1);
	assert.equal(result[0].json.record_id, 'rec1');
});

test('Chọn bảng động cũng dùng token ngoài và không gọi credential', async () => {
	const parameters: Record<string, string> = {
		base: 'ABC123',
		authentication: 'tenantToken',
		tenantAccessToken: 'provided-token',
		platform: 'lark',
	};
	const context = harness(
		{},
		async (options) => {
			assert.equal(options.headers?.Authorization, 'Bearer provided-token');
			return ok({ items: [{ name: 'Khách hàng', table_id: 'tbl123' }], has_more: false });
		},
		{ version: 2 },
	) as unknown as ILoadOptionsFunctions;
	context.getNodeParameter = ((name: string, fallback?: unknown) =>
		parameters[name] ?? fallback) as ILoadOptionsFunctions['getNodeParameter'];
	context.getCredentials = async () => {
		throw new Error('Không được gọi credential.');
	};
	assert.deepEqual((await searchTables.call(context)).results, [
		{ name: 'Khách hàng', value: 'tbl123' },
	]);
});

test('Search/List thiếu items không được hiểu là không có record', async () => {
	for (const operation of ['search', 'list']) {
		const context = harness({ operation }, async () => ok({}), { continueOnFail: true });
		const [output] = await new LarkBase().execute.call(context);
		assert.equal(output.length, 1);
		assert.match(output[0].json.error as string, /thiếu danh sách items/);
	}
});
