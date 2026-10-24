import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	ICredentialTestFunctions,
	ICredentialDataDecryptedObject,
	ICredentialsDecrypted,
	INodeCredentialTestResult,
} from 'n8n-workflow';
import type { ApiRequest, LarkClient, TokenProvider } from '../types';
import { API_ORIGINS, createTenantTokenProvider, readCredentials } from './getTenantAccessToken';
import { requestJson, type HttpRequest } from './http';
import { LarkRequestError } from './larkErrors';
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
): LarkClient {
	return {
		async request<T>({ method, path, operation, body, qs }: ApiRequest): Promise<T> {
			if (!path.startsWith('/bitable/v1/') || path.includes('..') || path.includes('?')) {
				throw new Error('Đường dẫn API Lark Base không hợp lệ.');
			}
			let token = await tokenProvider.getToken();
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
							...(qs === undefined ? {} : { qs }),
						},
						operation,
						[...secrets, token],
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
	const httpRequest = context.helpers.httpRequest.bind(context);
	if (usesTenantToken(context, itemIndex)) {
		const tokenProvider = createProvidedTokenProvider(
			authParameter(context, 'tenantAccessToken', '', itemIndex),
		);
		const platform = readPlatform(authParameter(context, 'platform', 'lark', itemIndex));
		return createLarkClient(httpRequest, API_ORIGINS[platform], tokenProvider);
	}
	const credentials = readCredentials(await context.getCredentials('vutiendungLarkApi'));
	return createLarkClient(
		httpRequest,
		API_ORIGINS[credentials.platform],
		createTenantTokenProvider(httpRequest, credentials),
		[credentials.appSecret],
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
