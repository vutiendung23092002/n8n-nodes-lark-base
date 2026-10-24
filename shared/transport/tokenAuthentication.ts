import type { IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-workflow';
import type { TokenProvider } from '../types';
import { API_ORIGINS } from './getTenantAccessToken';

type AuthContext = IExecuteFunctions | ILoadOptionsFunctions;

export function authParameter(
	context: AuthContext,
	name: string,
	fallback: string,
	itemIndex?: number,
): string {
	return (
		itemIndex === undefined
			? (context as ILoadOptionsFunctions).getNodeParameter(name, fallback)
			: (context as IExecuteFunctions).getNodeParameter(name, itemIndex, fallback)
	) as string;
}

export function usesTenantToken(context: AuthContext, itemIndex?: number): boolean {
	if (context.getNode().typeVersion < 2) return false;
	const mode = authParameter(context, 'authentication', 'tenantToken', itemIndex);
	if (mode !== 'tenantToken' && mode !== 'appCredentials')
		throw new Error(
			'Cách xác thực không hợp lệ. Hãy chọn token từ node trước hoặc credential ứng dụng.',
		);
	return mode === 'tenantToken';
}

export function readPlatform(input: unknown): keyof typeof API_ORIGINS {
	if (input !== 'lark' && input !== 'feishu')
		throw new Error('Nền tảng không hợp lệ. Hãy chọn Lark hoặc Feishu.');
	return input;
}

export function createProvidedTokenProvider(input: unknown): TokenProvider {
	if (typeof input !== 'string' || !input.trim()) {
		throw new Error(
			'Chưa có Tenant Access Token. Chạy node Lark Access Token trước rồi truyền tenant_access_token bằng expression; nếu danh sách bảng chưa tải được, dùng Table ID thủ công.',
		);
	}
	const token = input.trim();
	if (/\s/.test(token))
		throw new Error(
			'Tenant Access Token không được chứa khoảng trắng hoặc tiền tố Bearer. Chỉ truyền giá trị tenant_access_token.',
		);
	return {
		async getToken(forceRefresh = false) {
			if (forceRefresh)
				throw new Error(
					'Tenant Access Token được truyền vào đã hết hạn hoặc không hợp lệ. Hãy chạy lại node Lark Access Token và truyền token mới; node Base không có App Secret để tự làm mới.',
				);
			return token;
		},
	};
}
