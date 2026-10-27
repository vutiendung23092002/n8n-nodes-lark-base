import assert from 'node:assert/strict';
import { test } from 'node:test';
import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
} from 'n8n-workflow';
import type { ApiRequest, LarkClient, LarkField } from '../shared/types';
import type { RecordContext } from '../nodes/LarkBase/actions/record/types';
import {
	batchUpsert,
	checkDuplicates,
	uniqueOperation,
} from '../nodes/LarkBase/actions/record/unique.operation';
import { lookupByUniqueKey } from '../nodes/LarkBase/helpers/uniqueLookup';
import { normalizeUniqueKey, UniqueKeyError } from '../nodes/LarkBase/helpers/uniqueKey';
import { LarkBase } from '../nodes/LarkBase/v1/LarkBase.node.ts';
import { getUniqueKeyFields } from '../nodes/LarkBase/methods/loadOptions';
import { getWorkflowRuntime } from '../shared/runtime';
import { createLarkClient } from '../shared/transport/larkApiRequest';

const field: LarkField = { field_id: 'fldKey', field_name: 'Mã đơn', type: 1 };
const schema = [field, { field_id: 'fldRevenue', field_name: 'Doanh thu', type: 2 }];
const record = (id: string, key: string | number, extra: IDataObject = {}) => ({
	record_id: id,
	fields: { 'Mã đơn': key, ...extra },
});
const page = (items: unknown[], extra: object = {}) => ({ items, has_more: false, ...extra });

function harness(
	handler: (request: ApiRequest) => unknown | Promise<unknown>,
	overrides: Partial<RecordContext> = {},
) {
	const calls: ApiRequest[] = [];
	const client: LarkClient = {
		async request<T>(request: ApiRequest): Promise<T> {
			calls.push(request);
			return (await handler(request)) as T;
		},
	};
	const context: RecordContext = {
		client,
		path: '/bitable/v1/apps/ABC/tables/tbl1',
		uniqueKeyField: 'Mã đơn',
		fields: { 'Mã đơn': 'A001', 'Doanh thu': 100 },
		batchSize: 2,
		continueOnFail: false,
		pagination: { returnAll: false, limit: 1 },
		metadata: async () => schema,
		...overrides,
	};
	return { context, calls, writes: () => calls.filter(({ path }) => !path.endsWith('/search')) };
}

test('Upsert chỉ Create sau NOT_FOUND rõ ràng, không dùng view/sort/filter từ UI', async () => {
	const { context, calls } = harness(
		(request) =>
			request.path.endsWith('/search')
				? page([])
				: { record: record('recNew', 'A001', { 'Doanh thu': 100 }) },
		{ viewId: 'vewHidden', filter: { conjunction: 'or' } },
	);
	const result = await uniqueOperation('upsert')(context);
	assert.equal(result[0].action, 'created');
	assert.equal(result[0].unique_key, 'A001');
	assert.deepEqual(calls[0].body, {
		field_names: ['Mã đơn'],
		filter: {
			conjunction: 'or',
			conditions: [{ field_name: 'Mã đơn', operator: 'is', value: ['A001'] }],
		},
	});
	assert.equal(calls[1].method, 'POST');
});

test('Một kết quả → Update đúng ID, không sửa object response', async () => {
	const response = record('recOld', 'A001', { 'Doanh thu': 100 });
	const { context, calls } = harness((request) =>
		request.path.endsWith('/search') ? page([record('recOld', 'A001')]) : { record: response },
	);
	const result = await uniqueOperation('upsert')(context);
	assert.equal(result[0].action, 'updated');
	assert.equal(result[0].record_id, 'recOld');
	assert.equal(calls[1].method, 'PUT');
	assert(calls[1].path.endsWith('/records/recOld'));
	assert.equal(Object.hasOwn(response, 'action'), false);
});

test('Hai kết quả kể cả khác trang → Duplicate Error, không ghi', async () => {
	const { context, writes } = harness((request) =>
		request.qs?.page_token
			? page([record('rec2', 'A001')])
			: page([record('rec1', 'A001')], { has_more: true, page_token: 'next' }),
	);
	await assert.rejects(uniqueOperation('upsert')(context), (error: unknown) => {
		assert(error instanceof UniqueKeyError);
		assert.equal(error.details.duplicate_count, 2);
		assert.equal(error.details.unique_key, 'A001');
		return true;
	});
	assert.equal(writes().length, 0);
});

for (const [label, value] of [
	['null', null],
	['undefined', undefined],
	['rỗng', ''],
	['khoảng trắng', '   '],
	['cấu trúc', {}],
] as const) {
	test(`Unique Key ${label} bị chặn trước lookup/ghi`, async () => {
		const { context, calls } = harness(
			() => {
				throw new Error('Không được gọi API');
			},
			{ fields: { 'Mã đơn': value } },
		);
		await assert.rejects(uniqueOperation('upsert')(context));
		assert.equal(calls.length, 0);
	});
}

for (const invalidPage of [
	{},
	{ has_more: false },
	{ items: null, has_more: false },
	{ items: [], has_more: 'false' },
	{ items: [], has_more: true },
	{ items: [null], has_more: false },
	page([{ record_id: 'rec1' }]),
	page([record('rec1', 'B001')]),
]) {
	test(`Lookup phản hồi sai không thành NOT_FOUND: ${JSON.stringify(invalidPage)}`, async () => {
		const { context, writes } = harness(() => invalidPage);
		await assert.rejects(uniqueOperation('upsert')(context));
		assert.equal(writes().length, 0);
	});
}

test('Lookup lỗi trang sau, cursor lặp hoặc ID lặp không được Create/Update', async () => {
	for (const mode of ['lỗi', 'cursor', 'id']) {
		const { context, writes } = harness((request) => {
			if (!request.qs?.page_token)
				return page([record('rec1', 'A001')], { has_more: true, page_token: 'same' });
			if (mode === 'lỗi') throw new Error('Timeout trang sau');
			return page(
				[record('rec1', 'A001')],
				mode === 'cursor' ? { has_more: true, page_token: 'same' } : {},
			);
		});
		await assert.rejects(uniqueOperation('upsert')(context));
		assert.equal(writes().length, 0);
	}
});

test('Trang rỗng xác nhận total=0/has_more=false là NOT_FOUND; Text rich text được so sánh chính xác', async () => {
	const { context } = harness(() => ({ total: 0, has_more: false }));
	assert.deepEqual(
		await lookupByUniqueKey(context.client, context.path, field, normalizeUniqueKey('A001', field)),
		{ status: 'not_found' },
	);
	const rich = harness(() =>
		page([
			{
				record_id: 'rec1',
				fields: {
					'Mã đơn': [
						{ type: 'text', text: 'A' },
						{ type: 'text', text: '001' },
					],
				},
			},
		]),
	);
	assert.equal(
		(
			await lookupByUniqueKey(
				rich.context.client,
				context.path,
				field,
				normalizeUniqueKey('A001', field),
			)
		).status,
		'found',
	);
});

test('Number nhận 0, chuẩn hóa chuỗi số và chặn số nguyên mất chính xác', async () => {
	const numberField = { ...field, type: 2 };
	assert.equal(normalizeUniqueKey(0, numberField).filterValue, '0');
	assert.equal(
		normalizeUniqueKey('001', numberField).identity,
		normalizeUniqueKey(1, numberField).identity,
	);
	assert.throws(() => normalizeUniqueKey('9007199254740993', numberField), /độ chính xác/);
	assert.throws(() => normalizeUniqueKey('1.0000000000000001', numberField), /mất chữ số/);
	assert.equal(
		normalizeUniqueKey('001.2300', numberField).identity,
		normalizeUniqueKey('1.23e0', numberField).identity,
	);
	const { context, calls } = harness(
		(request) => (request.path.endsWith('/search') ? page([]) : { record: record('rec0', 0) }),
		{ metadata: async () => [numberField], fields: { 'Mã đơn': 0 } },
	);
	assert.equal((await uniqueOperation('upsert')(context))[0].unique_key, 0);
	assert.deepEqual((calls[0].body?.filter as IDataObject).conditions, [
		{ field_name: 'Mã đơn', operator: 'is', value: ['0'] },
	]);
});

test('Lookup lỗi HTTP/permission/timeout/429 hết retry không Create', async () => {
	for (const status of [403, 429, 500, 'network'] as const) {
		let writes = 0;
		let reads = 0;
		const client = createLarkClient(
			async (options) => {
				if (!options.url.endsWith('/search')) {
					writes++;
					return { statusCode: 200, body: { code: 0, data: {} } };
				}
				reads++;
				if (status === 'network') throw new Error('Timeout chứa bí mật');
				return {
					statusCode: status,
					headers: {},
					body: { code: status === 429 ? 1254290 : 1254302 },
				};
			},
			'https://open.larksuite.com',
			{ getToken: async () => 'secret-token' },
			[],
			{ sleep: async () => {}, random: () => 0 },
		);
		const { context } = harness(() => ({}), { client });
		await assert.rejects(uniqueOperation('upsert')(context));
		assert.equal(writes, 0);
		assert.equal(reads, status === 403 ? 1 : 5);
	}
});

const batch = ['A001', 'A002', 'A003'].map((key, index) => ({
	fields: { 'Mã đơn': key, 'Doanh thu': index },
}));
test('Batch Upsert mixed: lookup trước ghi, update trước create, trả đúng thứ tự theo khóa dù server đảo kết quả', async () => {
	const { context, calls } = harness(
		(request) => {
			if (request.path.endsWith('/search')) return page([record('rec2', 'A002')]);
			if (request.path.endsWith('/batch_update')) return { records: [record('rec2', 'A002')] };
			return { records: [record('rec3', 'A003'), record('rec1', 'A001')] };
		},
		{ records: batch },
	);
	const result = await batchUpsert(context);
	assert.deepEqual(
		result.map(({ unique_key, action, record_index }) => ({ unique_key, action, record_index })),
		[
			{ unique_key: 'A001', action: 'created', record_index: 0 },
			{ unique_key: 'A002', action: 'updated', record_index: 1 },
			{ unique_key: 'A003', action: 'created', record_index: 2 },
		],
	);
	assert.equal(calls.length, 3);
	assert(calls[1].path.endsWith('/batch_update'));
	assert(calls[2].path.endsWith('/batch_create'));
});

test('Batch input trùng, kể cả Number 01/1, bị chặn trước lookup', async () => {
	for (const type of [1, 2]) {
		const { context, calls } = harness(() => ({}), {
			metadata: async () => [{ ...field, type }],
			records: [
				{ fields: { 'Mã đơn': type === 1 ? 'A' : '01' } },
				{ fields: { 'Mã đơn': type === 1 ? 'A' : 1 } },
			],
		});
		await assert.rejects(batchUpsert(context), /trùng/);
		assert.equal(calls.length, 0);
	}
});

test('Một duplicate trên Lark hủy mọi ghi của Batch Upsert; Continue On Fail trả từng phần tử', async () => {
	for (const continueOnFail of [false, true]) {
		const { context, writes } = harness(
			() => page([record('rec1', 'A001'), record('rec2', 'A001')]),
			{ records: batch, continueOnFail },
		);
		if (!continueOnFail) await assert.rejects(batchUpsert(context), /2 bản ghi/);
		else {
			const result = await batchUpsert(context);
			assert.equal(result.length, 3);
			assert.equal(result[0].duplicate_count, 2);
			assert.equal(result[0].lookup_status, 'duplicate');
			assert.equal(result[1].duplicate_count, undefined);
			assert(result.every((item) => item.error && !item.action));
		}
		assert.equal(writes().length, 0);
	}
});

test('Lookup chia nhóm OR tối đa 10, lỗi nhóm sau vẫn không ghi các khóa nhóm đầu NOT_FOUND', async () => {
	let reads = 0;
	const records = Array.from({ length: 21 }, (_, index) => ({ fields: { 'Mã đơn': `A${index}` } }));
	const { context, calls, writes } = harness(
		(request) => {
			assert((request.body?.filter as IDataObject).conditions instanceof Array);
			if (++reads === 3) throw new Error('Lookup nhóm cuối lỗi');
			return page([]);
		},
		{ records, continueOnFail: true },
	);
	const result = await batchUpsert(context);
	assert.equal(calls.length, 3);
	assert.equal(writes().length, 0);
	assert.equal(result.length, 21);
	assert(result.every(({ error }) => error));
	assert.deepEqual(
		calls.map((request) => ((request.body?.filter as IDataObject).conditions as unknown[]).length),
		[10, 10, 1],
	);
});

for (const failed of ['batch_create', 'batch_update']) {
	test(`Batch Upsert ${failed} lỗi dừng các lô sau và giữ kết quả xác nhận trước`, async () => {
		const { context, calls } = harness(
			(request) => {
				if (request.path.endsWith('/search')) return page([record('rec2', 'A002')]);
				if (request.path.endsWith(`/${failed}`)) throw new Error('Trạng thái ghi không xác định');
				return { records: [record('rec2', 'A002')] };
			},
			{ records: batch, batchSize: 1, continueOnFail: true },
		);
		const result = await batchUpsert(context);
		assert.equal(result.length, 3);
		assert(result[0].error);
		assert.equal(result[0].record_index, 0);
		assert.equal(result[1].action, failed === 'batch_create' ? 'updated' : undefined);
		assert.equal(calls.length, failed === 'batch_create' ? 3 : 2);
	});
}

test('Batch Upsert không tin count/ID/khóa sai trong phản hồi ghi', async () => {
	for (const records of [
		[],
		[record('rec1', 'A001'), record('rec1', 'A002')],
		[record('rec1', 'A001'), record('rec2', 'B002')],
	]) {
		const { context } = harness(
			(request) => (request.path.endsWith('/search') ? page([]) : { records }),
			{ records: batch.slice(0, 2) },
		);
		await assert.rejects(batchUpsert(context), /khớp|trùng|thiếu/);
	}
});

for (const mode of ['updateByUniqueKey', 'deleteByUniqueKey'] as const) {
	test(`${mode}: 0 và nhiều kết quả không ghi, đúng 1 thì ghi đúng ID`, async () => {
		for (const count of [0, 1, 2]) {
			const { context, writes } = harness(
				(request) =>
					request.path.endsWith('/search')
						? page(Array.from({ length: count }, (_, i) => record(`rec${i}`, 'A001')))
						: mode === 'deleteByUniqueKey'
							? { record_id: 'rec0', deleted: true }
							: { record: record('rec0', 'A001') },
				{ uniqueKeyValue: 'A001' },
			);
			if (count !== 1) await assert.rejects(uniqueOperation(mode)(context));
			else
				assert.equal(
					(await uniqueOperation(mode)(context))[0].action,
					mode === 'deleteByUniqueKey' ? 'deleted' : 'updated',
				);
			assert.equal(writes().length, count === 1 ? 1 : 0);
		}
	});
}

test('Check Duplicates scan mọi trang, chỉ trả nhóm trùng và không có write', async () => {
	const { context, calls, writes } = harness((request) =>
		request.qs?.page_token
			? page([record('rec3', 'A001'), record('rec4', '')])
			: page([record('rec1', 'A001'), record('rec2', 'A002')], {
					has_more: true,
					page_token: 'next',
				}),
	);
	assert.deepEqual(await checkDuplicates(context), [
		{ unique_key: 'A001', count: 2, record_ids: ['rec1', 'rec3'] },
	]);
	assert.equal(calls.length, 2);
	assert.equal(writes().length, 0);
	assert.equal(calls[0].body?.filter, undefined);
});

function nodeContext(
	parameters: IDataObject[],
	http: (options: IHttpRequestOptions) => Promise<unknown>,
	continueOnFail = false,
): IExecuteFunctions {
	return {
		getInputData: () => parameters.map(() => ({ json: {} })),
		getTimezone: () => 'Asia/Ho_Chi_Minh',
		getNode: () => ({
			name: 'Lark Base',
			type: '@vutiendung/n8n-nodes-lark-base.larkBase',
			typeVersion: 3,
			parameters: {},
			position: [0, 0],
		}),
		getNodeParameter: (
			name: string,
			index: number,
			fallback?: unknown,
			options?: { extractValue?: boolean },
		) => {
			const values: IDataObject = {
				resource: 'record',
				operation: 'upsert',
				authentication: 'tenantToken',
				tenantAccessToken: 'token',
				base: 'ABC',
				table: 'tbl1',
				uniqueKeySource: 'manual',
				uniqueKeyFieldManual: 'Mã đơn',
				...parameters[index],
			};
			const value = Object.hasOwn(values, name) ? values[name] : fallback;
			return options?.extractValue && typeof value === 'object' && value
				? (value as { value: unknown }).value
				: value;
		},
		getCredentials: async () => {
			throw new Error('Không đọc credential trong token mode');
		},
		continueOnFail: () => continueOnFail,
		helpers: { httpRequest: http },
	} as unknown as IExecuteFunctions;
}
const fullResponse = (data: unknown) => ({ statusCode: 200, headers: {}, body: { code: 0, data } });

test('Preflight n8n chặn khóa trùng giữa items hoặc trong mảng trước mọi API', async () => {
	for (const continueOnFail of [false, true]) {
		for (const params of [
			[{ fields: { 'Mã đơn': 'A' } }, { fields: { 'Mã đơn': 'A' } }],
			[
				{
					operation: 'batchUpsert',
					records: [{ fields: { 'Mã đơn': 'A' } }, { fields: { 'Mã đơn': 'A' } }],
				},
			],
		]) {
			let calls = 0;
			const context = nodeContext(
				params,
				async () => {
					calls++;
					throw new Error('Không được gọi API');
				},
				continueOnFail,
			);
			if (!continueOnFail) await assert.rejects(new LarkBase().execute.call(context), /trùng/);
			else {
				const [output] = await new LarkBase().execute.call(context);
				assert(output.every(({ json }) => json.error));
				assert.equal(output.length, params.length);
			}
			assert.equal(calls, 0);
		}
	}
});

test('Preflight Number canonical giữa items chặn 01/1 trước lookup và ghi', async () => {
	let reads = 0;
	let writes = 0;
	const context = nodeContext(
		[{ fields: { 'Mã đơn': '01' } }, { fields: { 'Mã đơn': 1 } }],
		async (options) => {
			if (options.url.endsWith('/fields')) return fullResponse(page([{ ...field, type: 2 }]));
			if (options.url.endsWith('/search')) reads++;
			else writes++;
			return fullResponse({});
		},
		true,
	);
	const [output] = await new LarkBase().execute.call(context);
	assert(output.every(({ json }) => json.error));
	assert.equal(reads, 0);
	assert.equal(writes, 0);
});

test('Continue On Fail lookup lỗi trả error với pairedItem, không đi nhánh Create', async () => {
	let writes = 0;
	const context = nodeContext(
		[{ fields: { 'Mã đơn': 'A001' } }],
		async (options) => {
			if (options.url.endsWith('/fields')) return fullResponse(page(schema));
			if (options.url.endsWith('/search'))
				return { statusCode: 403, headers: {}, body: { code: 1254302, msg: 'token lỗi quyền' } };
			writes++;
			return fullResponse({});
		},
		true,
	);
	const [output] = await new LarkBase().execute.call(context);
	assert.equal(writes, 0);
	assert(output[0].json.error);
	assert.equal(output[0].json.unique_key, 'A001');
	assert.equal(output[0].json.action, undefined);
	assert.deepEqual(output[0].pairedItem, { item: 0 });
	assert.equal(JSON.stringify(output).includes('token lỗi quyền'), false);
});

test('Batch Upsert output giữ pairedItem theo n8n item và record_index theo phần tử mảng', async () => {
	const context = nodeContext([{ operation: 'batchUpsert', records: batch }], async (options) => {
		if (options.url.endsWith('/fields')) return fullResponse(page(schema));
		if (options.url.endsWith('/search')) return fullResponse(page([]));
		const records = (options.body as { records: Array<{ fields: IDataObject }> }).records;
		return fullResponse({
			records: records.map(({ fields }) => ({
				record_id: `rec${String(fields['Mã đơn']).slice(1)}`,
				fields,
			})),
		});
	});
	const [output] = await new LarkBase().execute.call(context);
	assert.equal(output.length, 3);
	assert.deepEqual(
		output.map(({ pairedItem }) => pairedItem),
		[{ item: 0 }, { item: 0 }, { item: 0 }],
	);
	assert.deepEqual(
		output.map(({ json }) => json.record_index),
		[0, 1, 2],
	);
});

test('Dropdown Unique Key chỉ trả Text/Number và metadata phân trang', async () => {
	const context = nodeContext([{}], async (options) =>
		fullResponse(
			page(
				options.qs?.page_token
					? [
							{ ...field, field_name: 'Số', type: 2 },
							{ ...field, field_name: 'Công thức', type: 20 },
						]
					: [field, { ...field, field_name: 'Nhiều', type: 4 }],
				options.qs?.page_token ? {} : { has_more: true, page_token: 'next' },
			),
		),
	) as unknown as ILoadOptionsFunctions;
	context.getNodeParameter = ((name: string, fallback?: unknown) =>
		({
			base: 'ABC',
			table: 'tbl1',
			authentication: 'tenantToken',
			tenantAccessToken: 'token',
			platform: 'lark',
		})[name] ?? fallback) as ILoadOptionsFunctions['getNodeParameter'];
	assert.deepEqual(
		(await getUniqueKeyFields.call(context)).map(({ value }) => value),
		['Mã đơn', 'Số'],
	);
});

test('Node version 1–3 giữ mặc định/credential cũ và nhận operation mới', () => {
	const { NodeHelpers } = getWorkflowRuntime();
	const { description } = new LarkBase();
	assert.deepEqual(description.version, [1, 2, 3]);
	assert.equal(description.defaultVersion, 3);
	for (const typeVersion of [1, 2, 3]) {
		const values = NodeHelpers.getNodeParameters(
			description.properties,
			{
				operation: 'upsert',
				uniqueKeySource: 'manual',
				uniqueKeyFieldManual: 'Mã đơn',
				fields: '{"Mã đơn":"A001"}',
			},
			true,
			false,
			{ typeVersion },
			description,
		)!;
		assert.equal(values.operation, 'upsert');
		assert.equal(values.uniqueKeyFieldManual, 'Mã đơn');
		assert(values.fields);
	}
});

test('Upsert chạy lại tuần tự: lần đầu tạo, lần sau cập nhật, không tạo thêm record', async () => {
	let saved: ReturnType<typeof record> | undefined;
	let creates = 0;
	let updates = 0;
	const { context } = harness((request) => {
		if (request.path.endsWith('/search')) return page(saved ? [saved] : []);
		if (request.method === 'POST') creates++;
		else updates++;
		saved = record('recOnce', 'A001');
		return { record: saved };
	});
	assert.equal((await uniqueOperation('upsert')(context))[0].action, 'created');
	assert.equal((await uniqueOperation('upsert')(context))[0].action, 'updated');
	assert.equal(creates, 1);
	assert.equal(updates, 1);
});

test('Batch ghi lỗi khi không Continue On Fail phải throw và dừng các lô còn lại', async () => {
	for (const target of ['batch_update', 'batch_create']) {
		const { context, writes } = harness(
			(request) => {
				if (request.path.endsWith('/search'))
					return page(target === 'batch_update' ? [record('rec2', 'A002')] : []);
				throw new Error('Lô lỗi');
			},
			{ records: batch, batchSize: 1 },
		);
		await assert.rejects(batchUpsert(context), /có thể đã được ghi/);
		assert.equal(writes().length, 1);
	}
});

test('Preflight khóa rỗng của node không gọi metadata/HTTP, output lỗi đúng item', async () => {
	for (const key of [null, undefined, '', '   ']) {
		let calls = 0;
		const context = nodeContext(
			[{ fields: { 'Mã đơn': key } }],
			async () => {
				calls++;
				throw new Error('Không HTTP');
			},
			true,
		);
		const [output] = await new LarkBase().execute.call(context);
		assert.equal(calls, 0);
		assert(output[0].json.error);
		assert.deepEqual(output[0].pairedItem, { item: 0 });
	}
});

test('Cột khóa phức tạp và không tồn tại bị chặn, không lookup/ghi', async () => {
	for (const type of [4, 11, 17, 20, 19]) {
		const { context, calls } = harness(() => ({}), { metadata: async () => [{ ...field, type }] });
		await assert.rejects(uniqueOperation('upsert')(context), /Text.*Number/);
		assert.equal(calls.length, 0);
	}
});

test('Lookup giới hạn byte UTF-8, chia nhóm nhỏ hơn nếu key dài và từ chối key quá lớn', async () => {
	const records = ['A', 'B', 'C'].map((prefix) => ({
		fields: { 'Mã đơn': prefix + 'đ'.repeat(4500) },
	}));
	let lookups = 0;
	const { context, writes } = harness(
		() => {
			lookups++;
			if (lookups === 3) throw new Error('Dừng thử nghiệm trước ghi');
			return page([]);
		},
		{ records },
	);
	await assert.rejects(batchUpsert(context));
	assert.equal(lookups, 3);
	assert.equal(writes().length, 0);
	const huge = harness(() => ({}), { fields: { 'Mã đơn': 'đ'.repeat(9000) } });
	await assert.rejects(uniqueOperation('upsert')(huge.context), /quá dài/);
	assert.equal(huge.calls.length, 0);
});

test('Duplicate output ở hai n8n items liên kết đúng từng item, không lộ token trong error', async () => {
	const context = nodeContext(
		[{ fields: { 'Mã đơn': 'A001' } }, { fields: { 'Mã đơn': 'A002' } }],
		async (options) => {
			if (options.url.endsWith('/fields')) return fullResponse(page(schema));
			if (!options.url.endsWith('/search')) throw new Error('Không được ghi');
			const filter = (options.body as { filter: { conditions: Array<{ value: string[] }> } })
				.filter;
			const key = filter.conditions[0].value[0];
			return fullResponse(page([record('rec1', key), record('rec2', key)]));
		},
		true,
	);
	const [output] = await new LarkBase().execute.call(context);
	assert.deepEqual(
		output.map(({ pairedItem }) => pairedItem),
		[{ item: 0 }, { item: 1 }],
	);
	assert.deepEqual(
		output.map(({ json }) => json.unique_key),
		['A001', 'A002'],
	);
	assert(
		output.every(({ json }) => json.duplicate_count === 2 && json.lookup_status === 'duplicate'),
	);
});
