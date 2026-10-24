import type { TenantAccessToken, TokenProvider } from '../types';
import { requestJson, type HttpRequest } from './http';

export const API_ORIGINS = {
	lark: 'https://open.larksuite.com',
	feishu: 'https://open.feishu.cn',
} as const;

export interface LarkCredentials {
	appId: string;
	appSecret: string;
	platform: keyof typeof API_ORIGINS;
}

export function readCredentials(raw: Record<string, unknown>): LarkCredentials {
	if (
		typeof raw.appId !== 'string' ||
		!raw.appId.trim() ||
		typeof raw.appSecret !== 'string' ||
		!raw.appSecret.trim()
	) {
		throw new Error('Cần cung cấp App ID và App Secret của ứng dụng Lark.');
	}
	const platform = raw.platform ?? 'lark';
	if (platform !== 'lark' && platform !== 'feishu') {
		throw new Error('Nền tảng không hợp lệ. Hãy chọn Lark hoặc Feishu.');
	}
	return { appId: raw.appId.trim(), appSecret: raw.appSecret.trim(), platform };
}

export function createTenantTokenProvider(
	httpRequest: HttpRequest,
	credentials: LarkCredentials,
): TokenProvider {
	let token: string | undefined;
	let expiresAt = 0;
	let pending: Promise<string> | undefined;
	async function refresh(): Promise<string> {
		const response = await getTenantAccessToken(httpRequest, credentials, [token ?? '']);
		token = response.tenant_access_token;
		// Làm mới sớm để tránh token hết hạn giữa hai trang; chỉ lưu trong vòng đời thực thi.
		expiresAt = Date.now() + Math.max(0, response.expire - 60) * 1000;
		return token;
	}
	return {
		async getToken(forceRefresh = false) {
			if (!forceRefresh && token && Date.now() < expiresAt) return token;
			if (!pending)
				pending = refresh().finally(() => {
					pending = undefined;
				});
			return await pending;
		},
	};
}

export async function getTenantAccessToken(
	httpRequest: HttpRequest,
	credentials: LarkCredentials,
	otherSecrets: readonly string[] = [],
): Promise<TenantAccessToken> {
	const response = await requestJson(
		httpRequest,
		{
			method: 'POST',
			url: `${API_ORIGINS[credentials.platform]}/open-apis/auth/v3/tenant_access_token/internal`,
			body: { app_id: credentials.appId, app_secret: credentials.appSecret },
		},
		'xác thực ứng dụng Lark',
		[credentials.appSecret, ...otherSecrets],
	);
	if (
		typeof response.tenant_access_token !== 'string' ||
		!response.tenant_access_token ||
		typeof response.expire !== 'number' ||
		!Number.isFinite(response.expire) ||
		response.expire <= 0
	) {
		throw new Error(
			'Lark trả về token hoặc thời hạn token không hợp lệ. Hãy kiểm tra ứng dụng nội bộ.',
		);
	}
	return {
		tenant_access_token: response.tenant_access_token,
		expire: response.expire,
		expires_at: Date.now() + response.expire * 1000,
	};
}
