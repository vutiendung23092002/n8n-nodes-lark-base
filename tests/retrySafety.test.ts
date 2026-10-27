import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { IHttpRequestOptions } from 'n8n-workflow';
import { createLarkClient } from '../shared/transport/larkApiRequest';
import { requestJson } from '../shared/transport/http';
import { createRetryController } from '../shared/transport/retry';

const origin = 'https://open.larksuite.com';
const success = {
	statusCode: 200,
	headers: {},
	body: { code: 0, data: { record: { record_id: 'rec1', fields: {} } } },
};
const provider = { getToken: async () => 'tenant-secret' };

test('READ retry 429 liên tục: đúng 5 request, backoff 500/1000/2000/4000 và jitter giới hạn', async () => {
	for (const random of [0, 0.5, 1]) {
		const waits: number[] = [];
		let calls = 0;
		const client = createLarkClient(
			async () => {
				calls++;
				return { statusCode: 429, headers: {}, body: { code: 99991400 } };
			},
			origin,
			provider,
			[],
			{
				sleep: async (ms) => {
					waits.push(ms);
				},
				random: () => random,
			},
		);
		await assert.rejects(
			client.request({
				method: 'POST',
				path: '/bitable/v1/apps/ABC/tables/tbl1/records/search',
				operation: 'lookup',
				body: {},
			}),
		);
		assert.equal(calls, 5);
		assert.deepEqual(
			waits,
			[500, 1000, 2000, 4000].map((value) => value + Math.floor(random * 250)),
		);
	}
});

for (const code of [99991400, 1254290]) {
	test(`READ rate limit mã ${code} trong HTTP 200 rồi thành công`, async () => {
		let calls = 0;
		const waits: number[] = [];
		await requestJson(
			async () => (++calls === 1 ? { statusCode: 200, headers: {}, body: { code } } : success),
			{ url: origin },
			'đọc',
			[],
			{
				policy: 'read',
				sleep: async (ms) => {
					waits.push(ms);
				},
				random: () => 0,
			},
		);
		assert.equal(calls, 2);
		assert.deepEqual(waits, [500]);
	});
}

test('Retry-After theo giây, HTTP date và tên header khác hoa thường được tôn trọng', async () => {
	const now = Date.parse('2026-10-27T00:00:00Z');
	for (const headers of [
		{ 'Retry-After': '3' },
		{ 'retry-after': ['3'] },
		{ 'RETRY-AFTER': new Date(now + 3000).toUTCString() },
	]) {
		const waits: number[] = [];
		const retry = createRetryController({
			policy: 'read',
			now: () => now,
			random: () => 0,
			sleep: async (ms) => {
				waits.push(ms);
			},
		});
		assert.equal(await retry.wait(0, headers), true);
		assert.deepEqual(waits, [3000]);
	}
});

test('Retry có ngân sách: không chờ quá 30 giây/lần, 30 giây tổng hoặc quá 120 giây đã tiêu thụ', async () => {
	let calls = 0;
	const retry = createRetryController({
		policy: 'read',
		random: () => 0,
		sleep: async () => {
			calls++;
		},
	});
	assert.equal(await retry.wait(0, { 'retry-after': '31' }), false);
	assert.equal(await retry.wait(0, { 'retry-after': '20' }), true);
	assert.equal(await retry.wait(1, { 'retry-after': '20' }), false);
	assert.equal(calls, 1);
	let now = 0;
	const timed = createRetryController({
		policy: 'read',
		now: () => now,
		sleep: async () => {
			throw new Error('Không chờ quá hạn');
		},
	});
	now = 120000;
	assert.equal(await timed.wait(0), false);
});

test('READ retry timeout/5xx, lỗi permission và WriteConflict không retry', async () => {
	for (const kind of ['network', '500', '403', 'conflict']) {
		let calls = 0;
		const client = createLarkClient(
			async () => {
				if (++calls > 1) return success;
				if (kind === 'network') throw new Error('Timeout chứa tenant-secret');
				return {
					statusCode: kind === '500' ? 500 : 403,
					headers: {},
					body: { code: kind === 'conflict' ? 1254291 : 1 },
				};
			},
			origin,
			provider,
			[],
			{ sleep: async () => {}, random: () => 0 },
		);
		const request = client.request({
			method: 'POST',
			path: '/bitable/v1/apps/ABC/tables/tbl1/records/search',
			operation: 'lookup',
		});
		if (kind === 'network' || kind === '500') {
			await request;
			assert.equal(calls, 2);
		} else {
			await assert.rejects(request);
			assert.equal(calls, 1);
		}
	}
});

for (const suffix of ['/records', '/records/batch_create']) {
	test(`Create ${suffix} retry timeout/429/5xx dùng cùng UUID v4 và query nhất quán`, async () => {
		for (const first of ['network', '429', '500']) {
			const requests: IHttpRequestOptions[] = [];
			const client = createLarkClient(
				async (options) => {
					requests.push(options);
					if (requests.length > 1) return success;
					if (first === 'network') throw new Error('Timeout');
					return {
						statusCode: Number(first),
						headers: {},
						body: { code: first === '429' ? 1254290 : 1 },
					};
				},
				origin,
				provider,
				[],
				{ sleep: async () => {}, random: () => 0 },
			);
			await client.request({
				method: 'POST',
				path: `/bitable/v1/apps/ABC/tables/tbl1${suffix}`,
				operation: 'tạo',
				body: { fields: { Tên: 'A' } },
			});
			assert.equal(requests.length, 2);
			assert.match(
				String(requests[0].qs?.client_token),
				/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
			);
			assert.equal(requests[0].qs?.client_token, requests[1].qs?.client_token);
			assert.equal(requests[0].qs?.ignore_consistency_check, false);
			assert.deepEqual(requests[0].body, requests[1].body);
		}
	});
}

test('Create token không đổi qua refresh xác thực, token mới cho logical request khác, không mutate query đầu vào', async () => {
	const requests: IHttpRequestOptions[] = [];
	const qs = { user_id_type: 'open_id' };
	const client = createLarkClient(
		async (options) => {
			requests.push(options);
			return requests.length === 1
				? { statusCode: 401, headers: {}, body: { code: 99991663 } }
				: success;
		},
		origin,
		provider,
	);
	const request = {
		method: 'POST' as const,
		path: '/bitable/v1/apps/ABC/tables/tbl1/records',
		operation: 'tạo',
		qs,
	};
	await client.request(request);
	await client.request(request);
	assert.equal(requests[0].qs?.client_token, requests[1].qs?.client_token);
	assert.notEqual(requests[1].qs?.client_token, requests[2].qs?.client_token);
	assert.deepEqual(qs, { user_id_type: 'open_id' });
});

test('Create nhận UUID v4 từ nguồn và chặn token sai trước HTTP', async () => {
	const token = '68c638ab-1697-4de6-9e92-0499a5d14ac4';
	let calls = 0;
	const client = createLarkClient(
		async (options) => {
			calls++;
			assert.equal(options.qs?.client_token, token);
			return success;
		},
		origin,
		provider,
	);
	await client.request({
		method: 'POST',
		path: '/bitable/v1/apps/ABC/tables/tbl1/records',
		operation: 'tạo',
		qs: { client_token: token },
	});
	await assert.rejects(
		client.request({
			method: 'POST',
			path: '/bitable/v1/apps/ABC/tables/tbl1/records',
			operation: 'tạo',
			qs: { client_token: 'sai' },
		}),
		/UUID v4/,
	);
	assert.equal(calls, 1);
});

test('WRITE Update/Delete không retry timeout/5xx/429/WriteConflict', async () => {
	for (const path of ['/records/rec1', '/records/batch_update', '/records/batch_delete']) {
		for (const failure of ['network', '500', '429', 'conflict']) {
			let calls = 0;
			const client = createLarkClient(
				async () => {
					calls++;
					if (failure === 'network') throw new Error('Bí mật tenant-secret');
					return {
						statusCode: failure === '500' ? 500 : 429,
						headers: {},
						body: { code: failure === 'conflict' ? 1254291 : 1254290 },
					};
				},
				origin,
				provider,
				[],
				{
					sleep: async () => {
						throw new Error('Không được retry');
					},
				},
			);
			await assert.rejects(
				client.request({
					method: path === '/records/rec1' ? 'PUT' : 'POST',
					path: `/bitable/v1/apps/ABC/tables/tbl1${path}`,
					operation: 'ghi',
				}),
				(error: unknown) => error instanceof Error && !String(error).includes('tenant-secret'),
			);
			assert.equal(calls, 1);
		}
	}
});

test('Create WriteConflict không retry dù có client_token; thiếu data không tự retry', async () => {
	for (const body of [{ code: 1254291 }, { code: 0 }]) {
		let calls = 0;
		const client = createLarkClient(
			async () => {
				calls++;
				return { statusCode: 200, headers: {}, body };
			},
			origin,
			provider,
		);
		await assert.rejects(
			client.request({
				method: 'POST',
				path: '/bitable/v1/apps/ABC/tables/tbl1/records',
				operation: 'tạo',
			}),
		);
		assert.equal(calls, 1);
	}
});

test('Mất phản hồi sau Create thành công: retry client_token giữ nguyên, không tạo lần hai trong mô phỏng server idempotent', async () => {
	const saved = new Map<string, unknown>();
	let creations = 0;
	let requests = 0;
	const client = createLarkClient(
		async (options) => {
			requests++;
			const token = String(options.qs?.client_token);
			if (!saved.has(token)) {
				creations++;
				saved.set(token, success);
				throw new Error('Mất phản hồi sau ghi');
			}
			return saved.get(token);
		},
		origin,
		provider,
		[],
		{ sleep: async () => {}, random: () => 0 },
	);
	await client.request({
		method: 'POST',
		path: '/bitable/v1/apps/ABC/tables/tbl1/records',
		operation: 'tạo',
		body: { fields: { Tên: 'A' } },
	});
	assert.equal(requests, 2);
	assert.equal(creations, 1);
});

test('Lỗi sau refresh phải che cả token cũ và token mới', async () => {
	let calls = 0;
	const client = createLarkClient(
		async () =>
			++calls === 1
				? { statusCode: 401, body: { code: 99991663 } }
				: { statusCode: 403, body: { code: 1254302, msg: 'token-cu-bi-mat token-moi-bi-mat' } },
		origin,
		{ getToken: async (force) => (force ? 'token-moi-bi-mat' : 'token-cu-bi-mat') },
	);
	await assert.rejects(
		client.request({ method: 'GET', path: '/bitable/v1/apps/ABC/tables', operation: 'đọc' }),
		(error: unknown) => {
			assert(error instanceof Error);
			assert(!error.message.includes('token-cu-bi-mat'));
			assert(!error.message.includes('token-moi-bi-mat'));
			return true;
		},
	);
});
