import type { LarkPage } from './types';

export interface PaginationOptions {
	returnAll: boolean;
	limit?: number;
	pageSize?: number;
}

export async function paginateLarkApi<T>(
	fetchPage: (pageToken: string | undefined, pageSize: number) => Promise<LarkPage<T>>,
	{ returnAll, limit = 100, pageSize = 500 }: PaginationOptions,
): Promise<T[]> {
	if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) {
		throw new Error('Kích thước trang phải là số nguyên từ 1 đến 500.');
	}
	if (!returnAll && (!Number.isSafeInteger(limit) || limit < 1)) {
		throw new Error('Giới hạn bản ghi phải là số nguyên dương.');
	}
	const result: T[] = [];
	const seen = new Set<string>();
	let pageToken: string | undefined;
	do {
		const size = returnAll ? pageSize : Math.min(pageSize, limit - result.length);
		const page = await fetchPage(pageToken, size);
		if (page.items !== undefined && !Array.isArray(page.items)) {
			throw new Error('Lark trả về trang dữ liệu không hợp lệ: items phải là một mảng.');
		}
		result.push(...(page.items ?? []).slice(0, returnAll ? undefined : limit - result.length));
		if (!page.has_more || (!returnAll && result.length >= limit)) break;
		if (!page.page_token || seen.has(page.page_token)) {
			throw new Error(
				'Lark báo còn dữ liệu nhưng page_token bị thiếu hoặc lặp lại; đã dừng phân trang.',
			);
		}
		pageToken = page.page_token;
		seen.add(pageToken);
	} while (pageToken !== undefined);
	return result;
}
