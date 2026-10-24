import assert from 'node:assert/strict';
import { test } from 'node:test';
import { paginateLarkApi } from '../shared/pagination';

test('Một trang và has_more=false kết thúc dù có page_token', async () => {
	let calls = 0;
	assert.deepEqual(
		await paginateLarkApi(
			async () => {
				calls++;
				return { items: [1, 2], has_more: false, page_token: 'khong-dung' };
			},
			{ returnAll: true },
		),
		[1, 2],
	);
	assert.equal(calls, 1);
});

test('Nhiều trang truyền đúng page_token, kể cả trang giữa rỗng', async () => {
	const tokens: Array<string | undefined> = [];
	assert.deepEqual(
		await paginateLarkApi(
			async (token) => {
				tokens.push(token);
				if (!token) return { items: [1], has_more: true, page_token: 'trang2' };
				if (token === 'trang2') return { has_more: true, page_token: 'trang3' };
				return { items: [2, 3], has_more: false };
			},
			{ returnAll: true },
		),
		[1, 2, 3],
	);
	assert.deepEqual(tokens, [undefined, 'trang2', 'trang3']);
});

test('Tôn trọng Limit qua nhiều trang và giảm page_size ở trang cuối', async () => {
	const sizes: number[] = [];
	const result = await paginateLarkApi(
		async (_token, size) => {
			sizes.push(size);
			return {
				items: Array.from({ length: size }, (_, i) => i),
				has_more: true,
				page_token: 'trang2',
			};
		},
		{ returnAll: false, limit: 501 },
	);
	assert.equal(result.length, 501);
	assert.deepEqual(sizes, [500, 1]);
});

test('Cắt kết quả nếu API trả vượt Limit', async () => {
	assert.deepEqual(
		await paginateLarkApi(async () => ({ items: [1, 2, 3], has_more: false }), {
			returnAll: false,
			limit: 2,
		}),
		[1, 2],
	);
});

test('Return All bỏ qua Limit và không bỏ sót dữ liệu', async () => {
	let calls = 0;
	const result = await paginateLarkApi(
		async () => {
			calls++;
			return { items: [calls], has_more: calls < 3, page_token: `trang${calls}` };
		},
		{ returnAll: true, limit: 1 },
	);
	assert.deepEqual(result, [1, 2, 3]);
});

test('Bảng trống trả mảng rỗng', async () => {
	assert.deepEqual(
		await paginateLarkApi(async () => ({ has_more: false }), { returnAll: true }),
		[],
	);
});

test('Dừng khi API thiếu page_token hoặc lặp token', async () => {
	await assert.rejects(
		paginateLarkApi(async () => ({ has_more: true }), { returnAll: true }),
		/page_token/,
	);
	await assert.rejects(
		paginateLarkApi(async () => ({ items: [1], has_more: true, page_token: 'same' }), {
			returnAll: true,
		}),
		/lặp/,
	);
});

test('Từ chối giới hạn và kích thước trang sai', async () => {
	for (const limit of [0, -1, 1.5, NaN, Infinity]) {
		await assert.rejects(
			paginateLarkApi(async () => ({}), { returnAll: false, limit }),
			/Giới hạn/,
		);
	}
	for (const pageSize of [0, 501, 1.5]) {
		await assert.rejects(
			paginateLarkApi(async () => ({}), { returnAll: true, pageSize }),
			/Kích thước/,
		);
	}
});
