import type { IHttpRequestOptions, IExecuteFunctions } from 'n8n-workflow';
import { LarkRequestError, normalizeLarkError } from './larkErrors';
import { getWorkflowRuntime } from '../runtime';

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
): Promise<Record<string, unknown>> {
	for (let attempt = 0; attempt <= 2; attempt++) {
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
			// Không đính kèm lỗi HTTP gốc vì có thể chứa header Authorization hoặc request body.
			throw new LarkRequestError(
				`Không thể ${operation}: lỗi kết nối hoặc hết thời gian chờ tới Lark. Kiểm tra mạng và trạng thái dịch vụ; thao tác ghi có thể đã được thực hiện.`,
				operation,
			);
		}
		const body = asObject(response.body);
		const code = typeof body.code === 'number' ? body.code : undefined;
		const limited = response.statusCode === 429 || code === 99991400 || code === 1254290;
		if (limited && attempt < 2) {
			const header = response.headers?.['retry-after'];
			const raw = Array.isArray(header) ? header[0] : header;
			const seconds = raw ? Number(raw) : NaN;
			const delay =
				raw && !Number.isFinite(seconds) ? Date.parse(raw) - Date.now() : seconds * 1000;
			const waitMs = Number.isFinite(delay) ? Math.max(0, delay) : 500 * 2 ** attempt;
			if (waitMs <= 30000) {
				const { sleep } = getWorkflowRuntime();
				await sleep(waitMs);
				continue;
			}
		}
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
	throw new LarkRequestError(`Không thể ${operation}: vượt số lần thử lại.`, operation);
}
