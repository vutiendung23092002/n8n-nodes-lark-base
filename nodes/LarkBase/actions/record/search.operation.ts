import type { LarkPage, LarkRecord } from '../../../../shared/types';
import { paginateLarkApi } from '../../../../shared/pagination';
import type { RecordOperation } from './types';

export const searchRecords: RecordOperation = async ({
	client,
	path,
	viewId,
	filter,
	sort,
	pagination,
}) =>
	await paginateLarkApi<LarkRecord>(async (pageToken, pageSize) => {
		const page = await client.request<LarkPage<LarkRecord>>({
				method: 'POST',
				path: `${path}/records/search`,
				operation: 'tìm hoặc liệt kê bản ghi',
				qs: {
					page_size: pageSize,
					user_id_type: 'open_id',
					...(pageToken ? { page_token: pageToken } : {}),
				},
				body: {
					...(viewId ? { view_id: viewId } : {}),
					...(filter ? { filter } : {}),
					...(sort ? { sort } : {}),
				},
			}),
			validEmpty = page?.items === undefined && page?.total === 0 && page?.has_more === false;
		if (
			!page ||
			(!Array.isArray(page.items) && !validEmpty) ||
			(Array.isArray(page.items) && page.items.length === 0 && typeof page.has_more !== 'boolean')
		)
			throw new Error(
				'Search thiếu danh sách items hợp lệ; không được hiểu lỗi phản hồi là không tìm thấy bản ghi.',
			);
		return page;
	}, pagination);
