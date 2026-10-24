import type { ILoadOptionsFunctions, INodeListSearchResult } from 'n8n-workflow';
import type { LarkPage, LarkTable } from '../../../shared/types';
import { clientForContext } from '../../../shared/transport/larkApiRequest';
import { parseBaseUrl } from '../helpers/parseBaseUrl';
import { paginateLarkApi } from '../../../shared/pagination';

export async function searchTables(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const { appToken } = parseBaseUrl(this.getNodeParameter('base') as string);
	const client = await clientForContext(this);
	const fetchPage = async (pageToken?: string) =>
		await client.request<LarkPage<LarkTable>>({
			method: 'GET',
			path: `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables`,
			operation: 'tải danh sách bảng; có thể chuyển sang nhập ID thủ công nếu không tải được',
			qs: { page_size: 100, ...(pageToken ? { page_token: pageToken } : {}) },
		});
	// API bảng không có tìm kiếm theo tên; phải lọc trên toàn bộ trang để tránh bỏ sót.
	if (filter) {
		const tables = await paginateLarkApi((pageToken) => fetchPage(pageToken), {
			returnAll: true,
			pageSize: 100,
		});
		return {
			results: tables
				.filter((table) => table.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()))
				.map((table) => ({ name: table.name, value: table.table_id })),
		};
	}
	const page = await fetchPage(paginationToken);
	return {
		results: (page.items ?? []).map((table) => ({ name: table.name, value: table.table_id })),
		...(page.has_more && page.page_token ? { paginationToken: page.page_token } : {}),
	};
}
