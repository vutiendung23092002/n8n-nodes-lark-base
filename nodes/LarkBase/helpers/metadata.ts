import type { LarkClient, LarkField, LarkPage } from '../../../shared/types';
import { paginateLarkApi } from '../../../shared/pagination';

export function tablePath(appToken: string, tableId: string): string {
	return `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}`;
}

export function createMetadataLoader(client: LarkClient) {
	const cache = new Map<string, Promise<LarkField[]>>();
	return async (appToken: string, tableId: string): Promise<LarkField[]> => {
		const path = tablePath(appToken, tableId);
		let pending = cache.get(path);
		if (!pending) {
			pending = paginateLarkApi<LarkField>(
				(pageToken, pageSize) =>
					client.request<LarkPage<LarkField>>({
						method: 'GET',
						path: `${path}/fields`,
						operation: 'lấy cấu trúc cột của bảng',
						qs: { page_size: pageSize, ...(pageToken ? { page_token: pageToken } : {}) },
					}),
				{ returnAll: true },
			);
			cache.set(path, pending);
			pending.catch(() => {
				cache.delete(path);
			});
		}
		return await pending;
	};
}
