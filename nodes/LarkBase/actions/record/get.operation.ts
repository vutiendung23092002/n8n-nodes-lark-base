import type { LarkRecord } from '../../../../shared/types';
import type { RecordOperation } from './types';

export const getRecord: RecordOperation = async ({ client, path, recordId }) => {
	const data = await client.request<{ record: LarkRecord }>({
		method: 'GET',
		path: `${path}/records/${recordId}`,
		operation: 'lấy bản ghi',
		qs: { user_id_type: 'open_id' },
	});
	if (!data.record?.record_id)
		throw new Error('Không tìm thấy bản ghi trong phản hồi từ Lark. Hãy kiểm tra Record ID.');
	return [data.record];
};
