import type { LarkPage } from './types';

export interface PaginationOptions {
	returnAll: boolean;
	limit?: number;
	pageSize?: number;
	strict?: boolean;
}

export async function paginateLarkApi<T>(
	fetchPage: (pageToken: string | undefined, pageSize: number) => Promise<LarkPage<T>>,
	{ returnAll, limit = 100, pageSize = 500, strict = false }: PaginationOptions,
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
	let expectedTotal: number | undefined;
	do {
		const size = returnAll ? pageSize : Math.min(pageSize, limit - result.length);
		const page = await fetchPage(pageToken, size);
		if (!page || typeof page !== 'object' || Array.isArray(page))
			throw new Error('Lark trả về trang dữ liệu không hợp lệ.');
		if (
			strict &&
			(typeof page.has_more !== 'boolean' ||
				(!Array.isArray(page.items) &&
					!(page.items === undefined && page.total === 0 && page.has_more === false)))
		) {
			throw new Error(
				'Phản hồi lookup thiếu items/has_more hợp lệ; không xác định được bản ghi tồn tại, không được Create.',
			);
		}
		if (page.items !== undefined && !Array.isArray(page.items)) {
			throw new Error('Lark trả về trang dữ liệu không hợp lệ: items phải là một mảng.');
		}
		if (strict && page.total !== undefined) {
			if (
				!Number.isSafeInteger(page.total) ||
				page.total < 0 ||
				(expectedTotal !== undefined && expectedTotal !== page.total)
			)
				throw new Error(
					'Tổng số kết quả lookup không hợp lệ hoặc thay đổi giữa các trang; không được ghi.',
				);
			expectedTotal = page.total;
		}
		result.push(...(page.items ?? []).slice(0, returnAll ? undefined : limit - result.length));
		if (
			strict &&
			expectedTotal !== undefined &&
			(result.length > expectedTotal ||
				(!page.has_more && returnAll && result.length !== expectedTotal))
		)
			throw new Error(
				'Số kết quả lookup không khớp total; không được coi là NOT_FOUND hoặc ghi dữ liệu.',
			);
		if (!page.has_more || (!returnAll && result.length >= limit)) break;
		if (
			!page.page_token ||
			(strict && typeof page.page_token !== 'string') ||
			seen.has(page.page_token)
		) {
			throw new Error(
				'Lark báo còn dữ liệu nhưng page_token bị thiếu hoặc lặp lại; đã dừng phân trang.',
			);
		}
		pageToken = page.page_token;
		seen.add(pageToken);
	} while (pageToken !== undefined);
	return result;
}
