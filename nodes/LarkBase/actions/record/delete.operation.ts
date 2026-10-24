import type { RecordOperation } from './types';

export const deleteRecord: RecordOperation = async ({ client, path, recordId }) => {
	const data = await client.request<{ record_id?: string; deleted?: boolean }>({
		method: 'DELETE',
		path: `${path}/records/${recordId}`,
		operation: 'xóa bản ghi',
	});
	if (typeof data.deleted !== 'boolean')
		throw new Error('Lark chưa xác nhận trạng thái xóa bản ghi. Hãy kiểm tra Base.');
	return [{ record_id: data.record_id ?? recordId, deleted: data.deleted }];
};
