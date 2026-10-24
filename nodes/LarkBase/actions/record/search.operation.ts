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
	await paginateLarkApi<LarkRecord>(
		(pageToken, pageSize) =>
			client.request<LarkPage<LarkRecord>>({
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
		pagination,
	);
