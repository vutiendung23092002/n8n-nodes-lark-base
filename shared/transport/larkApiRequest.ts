import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	ICredentialTestFunctions,
	ICredentialDataDecryptedObject,
	ICredentialsDecrypted,
	INodeCredentialTestResult,
} from 'n8n-workflow';
import { createHash, randomUUID } from 'node:crypto';
import type { ApiRequest, LarkClient, TokenProvider } from '../types';
import { API_ORIGINS, createTenantTokenProvider, readCredentials } from './getTenantAccessToken';
import { requestJson, type HttpRequest } from './http';
import { LarkRequestError } from './larkErrors';
import type { RetryOptions } from './retry';
import {
	authParameter,
	createProvidedTokenProvider,
	readPlatform,
	usesTenantToken,
} from './tokenAuthentication';

export function createLarkClient(
	httpRequest: HttpRequest,
	origin: string,
	tokenProvider: TokenProvider,
	secrets: readonly string[] = [],
	retryOptions: Omit<RetryOptions, 'policy'> = {},
): LarkClient {
	return {
		async request<T>({ method, path, operation, body, qs }: ApiRequest): Promise<T> {
			if (!path.startsWith('/bitable/v1/') || path.includes('..') || path.includes('?')) {
				throw new Error('Đường dẫn API Lark Base không hợp lệ.');
			}
			const creating =
				method === 'POST' && /\/tables\/[^/]+\/records(?:\/batch_create)?$/.test(path);
			const reading = method === 'GET' || (method === 'POST' && path.endsWith('/records/search'));
			// Token thuộc logical request, không tạo lại bên trong vòng retry hoặc refresh xác thực.
			const query = { ...qs };
			if (creating) {
				const supplied = query.client_token;
				if (
					supplied !== undefined &&
					(typeof supplied !== 'string' ||
						!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
							supplied,
						))
				)
					throw new Error('client_token của thao tác tạo cần là UUID v4 hợp lệ.');
				query.client_token = supplied ?? randomUUID();
				query.ignore_consistency_check = false;
			}
			let token = await tokenProvider.getToken();
			const seenTokens = new Set([token]);
			for (let attempt = 0; attempt < 2; attempt++) {
				try {
					const response = await requestJson(
						httpRequest,
						{
							method,
							url: `${origin}/open-apis${path}`,
							headers: {
								Authorization: `Bearer ${token}`,
								'Content-Type': 'application/json; charset=utf-8',
							},
							...(body === undefined ? {} : { body }),
							...(Object.keys(query).length ? { qs: query } : {}),
						},
						operation,
						[...secrets, ...seenTokens],
						{ ...retryOptions, policy: reading ? 'read' : creating ? 'idempotentCreate' : 'write' },
					);
					if (response.data === undefined || response.data === null) {
						throw new Error(`Không thể ${operation}: Lark trả về phản hồi thiếu dữ liệu.`);
					}
					return response.data as T;
				} catch (error) {
					if (
						error instanceof LarkRequestError &&
						attempt === 0 &&
						[99991663, 99991671].includes(error.larkCode ?? 0)
					) {
						token = await tokenProvider.getToken(true);
						seenTokens.add(token);
						continue;
					}
					throw error;
				}
			}
			throw new Error(`Không thể ${operation}: xác thực thất bại sau khi làm mới token.`);
		},
	};
}

export async function clientForContext(
	context: IExecuteFunctions | ILoadOptionsFunctions,
	itemIndex?: number,
): Promise<LarkClient> {
	return await resolveContextClient(context, itemIndex);
}

// Call once per execute. Resolve authentication for every item before deciding to reuse a client;
// a credential can contain expressions and a supplied token can vary with the input.
export function createExecutionClientResolver(context: IExecuteFunctions) {
	const clients = new Map<string, LarkClient>();
	return async (itemIndex: number): Promise<LarkClient> =>
		await resolveContextClient(context, itemIndex, clients);
}

async function resolveContextClient(
	context: IExecuteFunctions | ILoadOptionsFunctions,
	itemIndex?: number,
	clients?: Map<string, LarkClient>,
): Promise<LarkClient> {
	const httpRequest = context.helpers.httpRequest.bind(context);
	const reuse = (identity: readonly string[], create: () => LarkClient): LarkClient => {
		if (!clients) return create();
		// Length-prefix each UTF-8 component: no delimiter collisions or raw secrets in cache keys.
		// The digest and map stay private to this execution and are never logged or returned.
		const hash = createHash('sha256');
		for (const part of identity) hash.update(`${Buffer.byteLength(part, 'utf8')}:`).update(part);
		const key = hash.digest('hex');
		let client = clients.get(key);
		if (!client) {
			client = create();
			clients.set(key, client);
		}
		return client;
	};
	if (usesTenantToken(context, itemIndex)) {
		const input = authParameter(context, 'tenantAccessToken', '', itemIndex);
		const tokenProvider = createProvidedTokenProvider(input);
		const platform = readPlatform(authParameter(context, 'platform', 'lark', itemIndex));
		return reuse(['tenantToken', platform, input.trim()], () =>
			createLarkClient(httpRequest, API_ORIGINS[platform], tokenProvider),
		);
	}
	const credentials = readCredentials(await context.getCredentials('vutiendungLarkApi', itemIndex));
	return reuse(
		[
			'appCredentials',
			credentials.platform,
			context.getNode().credentials?.vutiendungLarkApi?.id ?? '',
			credentials.appId,
			credentials.appSecret,
		],
		() =>
			createLarkClient(
				httpRequest,
				API_ORIGINS[credentials.platform],
				createTenantTokenProvider(httpRequest, credentials),
				[credentials.appSecret],
			),
	);
}

export async function testLarkCredentials(
	context: ICredentialTestFunctions,
	raw: Record<string, unknown>,
): Promise<void> {
	const credentials = readCredentials(raw);
	// Ngữ cảnh kiểm tra credential của n8n chỉ cung cấp helper request đời trước.
	const httpRequest: HttpRequest = async (options) =>
		await context.helpers.request({
			method: options.method,
			uri: options.url,
			headers: options.headers,
			body: options.body,
			json: true,
			timeout: options.timeout,
			resolveWithFullResponse: true,
			simple: false,
			followRedirect: false,
			followAllRedirects: false,
		});
	await createTenantTokenProvider(httpRequest, credentials).getToken();
}

export async function larkApiCredentialTest(
	this: ICredentialTestFunctions,
	credential: ICredentialsDecrypted<ICredentialDataDecryptedObject>,
): Promise<INodeCredentialTestResult> {
	try {
		await testLarkCredentials(this, credential.data ?? {});
		return {
			status: 'OK',
			message:
				'Xác thực ứng dụng thành công. Quyền truy cập từng Base được kiểm tra khi chạy node.',
		};
	} catch (error) {
		return {
			status: 'Error',
			message: error instanceof Error ? error.message : 'Không thể xác thực ứng dụng Lark.',
		};
	}
}
