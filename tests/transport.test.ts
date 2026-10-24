import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { IHttpRequestOptions, ICredentialTestFunctions } from 'n8n-workflow';
import { createLarkClient, testLarkCredentials } from '../shared/transport/larkApiRequest';
import {
	createTenantTokenProvider,
	readCredentials,
	API_ORIGINS,
} from '../shared/transport/getTenantAccessToken';
import type { HttpRequest } from '../shared/transport/http';
import { requestJson } from '../shared/transport/http';
import { LarkRequestError } from '../shared/transport/larkErrors';

const credentials = {
	appId: 'cli_dummy',
	appSecret: 'secret-chi-dung-trong-test',
	platform: 'lark' as const,
};
const response = (body: unknown, statusCode = 200, headers = {}) => ({ body, statusCode, headers });

test('Token được dùng chung giữa các yêu cầu đồng thời và được làm mới chủ động', async () => {
	let calls = 0;
	const http: HttpRequest = async (options) => {
		calls++;
		assert.equal(options.method, 'POST');
		assert.equal(options.url, `${API_ORIGINS.lark}/open-apis/auth/v3/tenant_access_token/internal`);
		assert.deepEqual(options.body, {
			app_id: credentials.appId,
			app_secret: credentials.appSecret,
		});
		return response({ code: 0, tenant_access_token: `token${calls}`, expire: 7200 });
	};
	const provider = createTenantTokenProvider(http, credentials);
	assert.deepEqual(await Promise.all([provider.getToken(), provider.getToken()]), [
		'token1',
		'token1',
	]);
	assert.equal(await provider.getToken(), 'token1');
	assert.equal(await provider.getToken(true), 'token2');
	assert.equal(calls, 2);
});

test('Token gần hết hạn được lấy lại, credential khác không dùng chung token', async () => {
	let calls = 0;
	const http: HttpRequest = async () =>
		response({ code: 0, tenant_access_token: `token${++calls}`, expire: 30 });
	const provider = createTenantTokenProvider(http, credentials);
	assert.equal(await provider.getToken(), 'token1');
	assert.equal(await provider.getToken(), 'token2');
	assert.equal(
		await createTenantTokenProvider(http, { ...credentials, appSecret: 'secret-khac' }).getToken(),
		'token3',
	);
});

test('Token response lỗi không bị giữ trong cache', async () => {
	let calls = 0;
	const http: HttpRequest = async () =>
		++calls === 1
			? response({ code: 0, expire: 7200 })
			: response({ code: 0, expire: 7200, tenant_access_token: 'token-ok' });
	const provider = createTenantTokenProvider(http, credentials);
	await assert.rejects(provider.getToken(), /token.*không hợp lệ/);
	assert.equal(await provider.getToken(), 'token-ok');
});

for (const code of [99991663, 99991671]) {
	test(`Làm mới token đúng một lần cho mã ${code}`, async () => {
		const options: IHttpRequestOptions[] = [];
		const refreshes: boolean[] = [];
		const http: HttpRequest = async (option) => {
			options.push(option);
			return options.length === 1
				? response({ code, msg: 'invalid token' }, 400)
				: response({ code: 0, data: { items: [] } });
		};
		const client = createLarkClient(http, API_ORIGINS.lark, {
			async getToken(force = false) {
				refreshes.push(force);
				return force ? 'token-moi' : 'token-cu';
			},
		});
		await client.request({
			method: 'POST',
			path: '/bitable/v1/apps/ABC/tables/tbl1/records/search',
			body: {},
			operation: 'liệt kê',
		});
		assert.deepEqual(refreshes, [false, true]);
		assert.equal(options[0].headers?.Authorization, 'Bearer token-cu');
		assert.equal(options[1].headers?.Authorization, 'Bearer token-moi');
		assert.equal(options[1].disableFollowRedirect, true);
	});
}

test('Không lặp vô hạn khi token mới vẫn bị từ chối', async () => {
	let calls = 0;
	const client = createLarkClient(
		async () => {
			calls++;
			return response({ code: 99991663 }, 401);
		},
		API_ORIGINS.lark,
		{ getToken: async () => 'token' },
	);
	await assert.rejects(
		client.request({ method: 'GET', path: '/bitable/v1/apps/ABC/tables', operation: 'đọc bảng' }),
		LarkRequestError,
	);
	assert.equal(calls, 2);
});

test('Không làm mới token khi thiếu quyền và giữ context HTTP/Lark', async () => {
	let refreshes = 0;
	const client = createLarkClient(
		async () => response({ code: 1254302, msg: 'Permission denied' }, 403),
		API_ORIGINS.lark,
		{
			getToken: async () => {
				refreshes++;
				return 'token';
			},
		},
	);
	await assert.rejects(
		client.request({ method: 'GET', path: '/bitable/v1/apps/ABC/tables', operation: 'đọc bảng' }),
		(error: unknown) =>
			error instanceof Error &&
			/đọc bảng/.test(error.message) &&
			/HTTP: 403/.test(error.message) &&
			/1254302/.test(error.message) &&
			/Permission denied/.test(error.message),
	);
	assert.equal(refreshes, 1);
});

test('Che App Secret, token và Bearer trong message API', async () => {
	const client = createLarkClient(
		async () =>
			response({ code: 1234, msg: `${credentials.appSecret} token-rieng Bearer token-la` }, 400),
		API_ORIGINS.lark,
		{ getToken: async () => 'token-rieng' },
		[credentials.appSecret],
	);
	await assert.rejects(
		client.request({ method: 'GET', path: '/bitable/v1/apps/ABC/tables', operation: 'đọc bảng' }),
		(error: unknown) => {
			const text = JSON.stringify(error) + String(error);
			assert.equal(text.includes(credentials.appSecret), false);
			assert.equal(text.includes('token-rieng'), false);
			assert.equal(text.includes('token-la'), false);
			return true;
		},
	);
});

test('Lỗi mạng không lộ request gốc và không tự gửi lại thao tác ghi', async () => {
	let calls = 0;
	const http: HttpRequest = async () => {
		calls++;
		throw new Error(`Authorization Bearer token ${credentials.appSecret}`);
	};
	await assert.rejects(
		requestJson(http, { method: 'POST', url: API_ORIGINS.lark }, 'tạo bản ghi', [
			credentials.appSecret,
		]),
		(error: unknown) =>
			error instanceof Error &&
			/lỗi kết nối/.test(error.message) &&
			!error.message.includes(credentials.appSecret) &&
			!error.message.includes('Bearer') &&
			!Object.hasOwn(error, 'cause'),
	);
	assert.equal(calls, 1);
});

test('HTTP 429 được thử lại, tôn trọng Retry-After và dừng sau ba lần', async () => {
	let calls = 0;
	const http: HttpRequest = async () => {
		calls++;
		return calls < 3
			? response({ code: 99991400 }, 429, { 'retry-after': '0' })
			: response({ code: 0 });
	};
	assert.deepEqual(await requestJson(http, { url: API_ORIGINS.lark }, 'đọc bảng', []), { code: 0 });
	assert.equal(calls, 3);
	calls = 0;
	await assert.rejects(
		requestJson(
			async () => {
				calls++;
				return response({ code: 99991400 }, 429, { 'retry-after': '0' });
			},
			{ url: API_ORIGINS.lark },
			'đọc bảng',
			[],
		),
		/429/,
	);
	assert.equal(calls, 3);
});

test('Không giữ execution khi Retry-After quá dài, không gửi lại lỗi 500', async () => {
	for (const status of [429, 500]) {
		let calls = 0;
		await assert.rejects(
			requestJson(
				async () => {
					calls++;
					return response({}, status, { 'retry-after': '120' });
				},
				{ url: API_ORIGINS.lark },
				'ghi bản ghi',
				[],
			),
		);
		assert.equal(calls, 1);
	}
});

test('Không nhận HTTP thành công nếu Lark code sai hoặc phản hồi không đúng JSON', async () => {
	for (const body of [{ code: 1 }, '<html>lỗi proxy</html>', {}]) {
		await assert.rejects(
			requestJson(async () => response(body), { url: API_ORIGINS.lark }, 'đọc bảng', []),
		);
	}
});

test('Nền tảng xác thực chỉ lấy từ lựa chọn hợp lệ', () => {
	assert.equal(readCredentials(credentials).platform, 'lark');
	assert.equal(readCredentials({ ...credentials, platform: 'feishu' }).platform, 'feishu');
	assert.throws(
		() => readCredentials({ ...credentials, platform: 'https://example.com' }),
		/Nền tảng/,
	);
	assert.throws(() => readCredentials({ ...credentials, appSecret: '' }), /App ID.*App Secret/);
});

test('Kiểm tra credential tái sử dụng token provider qua helper request của n8n', async () => {
	let calls = 0;
	const context = {
		helpers: {
			request: async (option: unknown) => {
				calls++;
				const request = option as Record<string, unknown>;
				assert.equal(
					request.uri,
					`${API_ORIGINS.feishu}/open-apis/auth/v3/tenant_access_token/internal`,
				);
				assert.equal(request.simple, false);
				assert.equal(request.followAllRedirects, false);
				return response({ code: 0, tenant_access_token: 'token-test', expire: 7200 });
			},
		},
	} as unknown as ICredentialTestFunctions;
	await testLarkCredentials(context, { ...credentials, platform: 'feishu' });
	assert.equal(calls, 1);
});
