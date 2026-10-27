import type { IHttpRequestOptions, IExecuteFunctions } from 'n8n-workflow';
import { LarkRequestError, normalizeLarkError } from './larkErrors';
import { createRetryController, type RetryOptions } from './retry';

export type HttpRequest = IExecuteFunctions['helpers']['httpRequest'];

interface HttpResult {
	statusCode: number;
	headers: Record<string, string | string[] | undefined>;
	body: unknown;
}

export function asObject(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

export async function requestJson(
	httpRequest: HttpRequest,
	options: IHttpRequestOptions,
	operation: string,
	secrets: readonly string[],
	retryOptions: RetryOptions = {},
): Promise<Record<string, unknown>> {
	const retry = createRetryController(retryOptions);
	for (let attempt = 0; ; attempt++) {
		let response: HttpResult;
		try {
			response = (await httpRequest({
				...options,
				json: true,
				timeout: 30000,
				returnFullResponse: true,
				ignoreHttpStatusErrors: true,
				disableFollowRedirect: true,
			})) as HttpResult;
		} catch {
			if (
				(retry.policy === 'read' || retry.policy === 'idempotentCreate') &&
				(await retry.wait(attempt))
			)
				continue;
			// Không đính kèm lỗi HTTP gốc vì có thể chứa header Authorization hoặc request body.
			throw new LarkRequestError(
				`Không thể ${operation}: lỗi kết nối hoặc hết thời gian chờ tới Lark. ${retry.policy === 'read' ? 'Không xác định được kết quả đọc; không được coi là không tìm thấy.' : 'Thao tác ghi có thể đã được thực hiện; kiểm tra Base trước khi chạy lại.'}`,
				operation,
			);
		}
		if (
			!response ||
			!Number.isInteger(response.statusCode) ||
			response.statusCode < 100 ||
			response.statusCode > 599
		)
			throw new LarkRequestError(
				`Không thể ${operation}: phản hồi HTTP không hợp lệ, không xác định được kết quả.`,
				operation,
			);
		const body = asObject(response.body);
		const code = typeof body.code === 'number' ? body.code : undefined;
		const limited = response.statusCode === 429 || code === 99991400 || code === 1254290;
		const transient = response.statusCode === 408 || response.statusCode >= 500;
		// WriteConflict không nằm trong danh sách retry: chưa có bảo đảm an toàn side effect.
		const mayRetry =
			code !== 1254291 &&
			(limited || (transient && (retry.policy === 'read' || retry.policy === 'idempotentCreate')));
		if (mayRetry && (await retry.wait(attempt, asObject(response.headers)))) continue;
		if (response.statusCode < 200 || response.statusCode >= 300 || code !== 0) {
			throw normalizeLarkError(
				operation,
				response.statusCode,
				code,
				typeof body.msg === 'string' ? body.msg : undefined,
				secrets,
			);
		}
		return body;
	}
}
