import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ApiRequest, LarkClient, LarkField } from '../shared/types';
import { chunkItems } from '../shared/batch';
import { batchOperation } from '../nodes/LarkBase/actions/record/batch.operation';
import type { RecordContext } from '../nodes/LarkBase/actions/record/types';

const schema: LarkField[] = [{ field_id: 'fld1', field_name: 'Tên', type: 1 }];
function context(client: LarkClient, overrides: Partial<RecordContext> = {}): RecordContext {
	return {
		client,
		path: '/bitable/v1/apps/ABC/tables/tbl1',
		batchSize: 2,
		continueOnFail: false,
		pagination: { returnAll: false },
		metadata: async () => schema,
		...overrides,
	};
}

for (const [length, size, lengths] of [
	[0, 3, []],
	[2, 3, [2]],
	[3, 3, [3]],
	[4, 3, [3, 1]],
	[10, 3, [3, 3, 3, 1]],
] as const) {
	test(`Chia ${length} phần tử thành lô kích thước ${size}`, () => {
		const input = Array.from({ length }, (_, i) => i);
		const chunks = chunkItems(input, size);
		assert.deepEqual(
			chunks.map((chunk) => chunk.length),
			lengths,
		);
		assert.deepEqual(chunks.flat(), input);
	});
}

test('Kích thước lô sai bị từ chối kể cả input rỗng', () => {
	for (const size of [0, -1, 1.5, 501, NaN, Infinity]) assert.throws(() => chunkItems([], size));
});

test('Tạo theo lô chia request và ghép kết quả', async () => {
	const calls: ApiRequest[] = [];
	const client: LarkClient = {
		async request<T>(request: ApiRequest): Promise<T> {
			calls.push(request);
			const records = request.body?.records as Array<{ fields: object }>;
			return {
				records: records.map((record, index) => ({
					record_id: `rec${calls.length}${index}`,
					...record,
				})),
			} as T;
		},
	};
	const result = await batchOperation('create')(
		context(client, {
			records: [{ fields: { Tên: 'An' } }, { fields: { Tên: 'Bình' } }, { fields: { Tên: 'Chi' } }],
		}),
	);
	assert.equal(calls.length, 2);
	assert.equal(calls[0].path.endsWith('/records/batch_create'), true);
	assert.equal(result.length, 3);
	assert.deepEqual(
		result.map((record) => (record.fields as Record<string, unknown>).Tên),
		['An', 'Bình', 'Chi'],
	);
});

test('Định dạng sai ở lô sau không được ghi bất cứ lô nào', async () => {
	let calls = 0;
	const client: LarkClient = {
		async request<T>(): Promise<T> {
			calls++;
			return {} as T;
		},
	};
	await assert.rejects(
		batchOperation('create')(
			context(client, {
				records: [
					{ fields: { Tên: 'An' } },
					{ fields: { Tên: 'Bình' } },
					{ fields: { 'Cột sai': 1 } },
				],
			}),
		),
		/Cột sai/,
	);
	assert.equal(calls, 0);
});

test('Cập nhật và xóa theo lô khôi phục thứ tự theo Record ID', async () => {
	for (const mode of ['update', 'delete'] as const) {
		const client: LarkClient = {
			async request<T>(request: ApiRequest): Promise<T> {
				assert.equal(request.path.endsWith(`/records/batch_${mode}`), true);
				return {
					records: [
						{ record_id: 'rec2', deleted: true },
						{ record_id: 'rec1', deleted: true },
					],
				} as T;
			},
		};
		const records =
			mode === 'delete'
				? ['rec1', 'rec2']
				: [
						{ record_id: 'rec1', fields: { Tên: 'An' } },
						{ record_id: 'rec2', fields: { Tên: 'Bình' } },
					];
		const result = await batchOperation(mode)(context(client, { records }));
		assert.deepEqual(
			result.map((record) => record.record_id),
			['rec1', 'rec2'],
		);
	}
});

test('Continue On Fail giữ kết quả lô trước và tiếp tục lô sau', async () => {
	let calls = 0;
	const client: LarkClient = {
		async request<T>(request: ApiRequest): Promise<T> {
			calls++;
			if (calls === 2) throw new Error('Thiếu quyền ghi');
			return {
				records: (request.body?.records as string[]).map((record_id) => ({
					record_id,
					deleted: true,
				})),
			} as T;
		},
	};
	const result = await batchOperation('delete')(
		context(client, {
			continueOnFail: true,
			records: ['rec1', 'rec2', 'rec3', 'rec4', 'rec5'],
		}),
	);
	assert.equal(calls, 3);
	assert.equal(result.length, 5);
	assert.equal(result[0].deleted, true);
	assert.match(result[2].error as string, /Lô 2\/3.*3–4/);
	assert.equal(result[3].record_index, 3);
	assert.equal(result[4].deleted, true);
});

test('Khi dừng vì lỗi lô phải chỉ rõ vị trí và khả năng ghi một phần', async () => {
	let calls = 0;
	const client: LarkClient = {
		async request<T>(request: ApiRequest): Promise<T> {
			if (++calls === 2) throw new Error('Lỗi dịch vụ');
			return {
				records: (request.body?.records as string[]).map((record_id) => ({
					record_id,
					deleted: true,
				})),
			} as T;
		},
	};
	await assert.rejects(
		batchOperation('delete')(context(client, { records: ['rec1', 'rec2', 'rec3'] })),
		/Lô 2\/2.*có thể đã được ghi/,
	);
	assert.equal(calls, 2);
});
