import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { IDataObject, IExecuteFunctions, IHttpRequestOptions } from 'n8n-workflow';
import { LarkAccessToken } from '../nodes/LarkAccessToken/LarkAccessToken.node.ts';
import { getWorkflowRuntime } from '../shared/runtime';
import { LarkBase } from '../nodes/LarkBase/v1/LarkBase.node.ts';

function tokenContext(
	parameters: IDataObject[],
	http: (options: IHttpRequestOptions) => Promise<unknown>,
	continueOnFail = false,
): IExecuteFunctions {
	return {
		getInputData: () => parameters.map(() => ({ json: {} })),
		getNode: () => ({
			name: 'Lark Access Token',
			type: '@vutiendung/n8n-nodes-lark-base.larkAccessToken',
			typeVersion: 1,
			parameters: {},
			position: [0, 0],
		}),
		getNodeParameter: (name: string, index: number, fallback: unknown) =>
			parameters[index][name] ?? fallback,
		getCredentials: async () => {
			throw new Error('Không được gọi credential trong node cấp token.');
		},
		continueOnFail: () => continueOnFail,
		helpers: { httpRequest: http },
	} as unknown as IExecuteFunctions;
}

test('Node token gọi endpoint nội bộ, không cần credential và không trả App Secret hoặc input', async () => {
	const now = Date.now();
	const [result] = await new LarkAccessToken().execute.call(
		tokenContext(
			[{ appId: 'cli_test', appSecret: 'secret-test', platform: 'lark', data: 'không trả input' }],
			async (options) => {
				assert.equal(options.method, 'POST');
				assert.equal(
					options.url,
					'https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal',
				);
				assert.deepEqual(options.body, { app_id: 'cli_test', app_secret: 'secret-test' });
				return {
					statusCode: 200,
					headers: {},
					body: { code: 0, expire: 7200, tenant_access_token: 'test-token' },
				};
			},
		),
	);
	assert.equal(result[0].json.tenant_access_token, 'test-token');
	assert.equal(result[0].json.expire, 7200);
	assert.equal(result[0].json.token_type, 'Bearer');
	assert.equal(result[0].json.platform, 'lark');
	assert(Number(result[0].json.expires_at) >= now + 7200000);
	assert.equal(JSON.stringify(result).includes('secret-test'), false);
	assert.equal(Object.hasOwn(result[0].json, 'appId'), false);
	assert.deepEqual(result[0].pairedItem, { item: 0 });
});

test('Token được lấy theo App ID/Secret/nền tảng của từng item', async () => {
	const requests: IHttpRequestOptions[] = [];
	const [result] = await new LarkAccessToken().execute.call(
		tokenContext(
			[
				{ appId: 'cli_lark', appSecret: 'secret1', platform: 'lark' },
				{ appId: 'cli_feishu', appSecret: 'secret2', platform: 'feishu' },
			],
			async (options) => {
				requests.push(options);
				return {
					statusCode: 200,
					headers: {},
					body: { code: 0, expire: 7200, tenant_access_token: `token${requests.length}` },
				};
			},
		),
	);
	assert.equal(requests[1].url.startsWith('https://open.feishu.cn/'), true);
	assert.deepEqual(requests[1].body, { app_id: 'cli_feishu', app_secret: 'secret2' });
	assert.deepEqual(
		result.map((item) => item.json.tenant_access_token),
		['token1', 'token2'],
	);
	assert.deepEqual(result[1].pairedItem, { item: 1 });
});

test('Node token xử lý lỗi App Secret an toàn và Continue On Fail cho từng item', async () => {
	const [result] = await new LarkAccessToken().execute.call(
		tokenContext(
			[
				{ appId: 'cli_test', appSecret: 'sensitive-secret', platform: 'lark' },
				{ appId: 'cli_test', appSecret: '', platform: 'lark' },
			],
			async () => ({
				statusCode: 400,
				headers: {},
				body: { code: 10003, msg: 'invalid sensitive-secret' },
			}),
			true,
		),
	);
	assert.equal(result.length, 2);
	assert.equal(JSON.stringify(result).includes('sensitive-secret'), false);
	assert.match(result[0].json.error as string, /10003/);
	assert.match(result[1].json.error as string, /App ID.*App Secret/);
	assert.equal(
		result.some((item) => Object.hasOwn(item.json, 'tenant_access_token')),
		false,
	);
});

test('Node token dừng đúng lỗi n8n khi Continue On Fail tắt', async () => {
	await assert.rejects(
		new LarkAccessToken().execute.call(
			tokenContext([{ appId: '', appSecret: '' }], async () => {
				throw new Error('Không gọi HTTP');
			}),
		),
		/App ID.*App Secret/,
	);
});

test('Node token từ chối phản hồi token thiếu hoặc thời hạn sai', async () => {
	for (const body of [
		{ code: 0, expire: 7200 },
		{ code: 0, expire: 0, tenant_access_token: 'token' },
	]) {
		await assert.rejects(
			new LarkAccessToken().execute.call(
				tokenContext([{ appId: 'cli', appSecret: 'secret' }], async () => ({
					statusCode: 200,
					headers: {},
					body,
				})),
			),
			/token.*không hợp lệ/,
		);
	}
});

test('n8n chỉ yêu cầu credential ở chế độ ứng dụng, giữ nguyên node version 1', () => {
	const { NodeHelpers } = getWorkflowRuntime();
	const { description } = new LarkBase();
	const credential = description.credentials![0];
	assert.equal(description.credentials!.length, 1);
	const oldParameters = NodeHelpers.getNodeParameters(
		description.properties,
		{},
		true,
		false,
		{ typeVersion: 1 },
		description,
	)!;
	assert.equal(Object.hasOwn(oldParameters, 'authentication'), false);
	assert.equal(
		NodeHelpers.displayParameter(oldParameters, credential, { typeVersion: 1 }, description),
		true,
	);
	const newParameters = NodeHelpers.getNodeParameters(
		description.properties,
		{},
		true,
		false,
		{ typeVersion: 2 },
		description,
	)!;
	assert.equal(newParameters.authentication, 'tenantToken');
	assert.equal(
		NodeHelpers.displayParameter(newParameters, credential, { typeVersion: 2 }, description),
		false,
	);
	assert.equal(
		NodeHelpers.displayParameter(
			{ authentication: 'appCredentials' },
			credential,
			{ typeVersion: 2 },
			description,
		),
		true,
	);
	const tokenDescription = new LarkAccessToken().description;
	assert.equal(
		NodeHelpers.displayParameter(
			{},
			tokenDescription.credentials![0],
			{ typeVersion: 1 },
			tokenDescription,
		),
		false,
	);
	assert.equal(
		NodeHelpers.displayParameter(
			{},
			tokenDescription.credentials![0],
			{ typeVersion: 2 },
			tokenDescription,
		),
		true,
	);
});

test('Node token version 2 lấy secret từ credential, không đọc parameter dù còn secret cũ', async () => {
	const context = tokenContext([{}], async (options) => {
		assert.deepEqual(options.body, { app_id: 'cli_secure', app_secret: 'secret-from-credential' });
		assert.equal(options.url.startsWith('https://open.feishu.cn/'), true);
		return {
			statusCode: 200,
			headers: {},
			body: { code: 0, expire: 7200, tenant_access_token: 'new-token' },
		};
	});
	const getNode = context.getNode.bind(context);
	context.getNode = () => ({
		...getNode(),
		typeVersion: 2,
		parameters: { appSecret: 'legacy-secret' },
	});
	context.getNodeParameter = () => {
		throw new Error('Không được đọc App Secret từ parameter ở version 2.');
	};
	context.getCredentials = async <T extends object>(name: string) => {
		assert.equal(name, 'vutiendungLarkApi');
		return { appId: 'cli_secure', appSecret: 'secret-from-credential', platform: 'feishu' } as T;
	};
	const [result] = await new LarkAccessToken().execute.call(context);
	assert.equal(result[0].json.tenant_access_token, 'new-token');
	assert.equal(result[0].json.platform, 'feishu');
	assert.equal(JSON.stringify(result).includes('secret-from-credential'), false);
	assert.equal(JSON.stringify(result).includes('legacy-secret'), false);
});

test('Node token mới không có App ID/App Secret trong defaults hoặc trường có thể chuyển expression', () => {
	const { NodeHelpers } = getWorkflowRuntime();
	const description = new LarkAccessToken().description;
	assert.equal(description.defaultVersion, 2);
	const parameters = NodeHelpers.getNodeParameters(
		description.properties,
		{},
		true,
		false,
		{ typeVersion: 2 },
		description,
	)!;
	for (const name of ['appId', 'appSecret', 'platform']) {
		assert.equal(Object.hasOwn(parameters, name), false);
		const property = description.properties.find((entry) => entry.name === name)!;
		assert.equal(
			NodeHelpers.displayParameter(parameters, property, { typeVersion: 2 }, description),
			false,
		);
	}
	const example = JSON.parse(readFileSync('examples/token-list-records.workflow.json', 'utf8')) as {
		nodes: Array<{ type: string; typeVersion: number; parameters: Record<string, unknown> }>;
	};
	const token = example.nodes.find((node) => node.type.endsWith('.larkAccessToken'))!;
	assert.equal(token.typeVersion, 2);
	assert.deepEqual(token.parameters, {});
});

test('Lỗi xác thực bằng credential không trả App Secret', async () => {
	const context = tokenContext(
		[{}],
		async () => ({
			statusCode: 400,
			headers: {},
			body: { code: 10003, msg: 'invalid private-credential-secret' },
		}),
		true,
	);
	const getNode = context.getNode.bind(context);
	context.getNode = () => ({ ...getNode(), typeVersion: 2 });
	context.getCredentials = async <T extends object>() =>
		({ appId: 'cli_secure', appSecret: 'private-credential-secret' }) as T;
	const [result] = await new LarkAccessToken().execute.call(context);
	assert.equal(JSON.stringify(result).includes('private-credential-secret'), false);
	assert.match(result[0].json.error as string, /10003/);
});
