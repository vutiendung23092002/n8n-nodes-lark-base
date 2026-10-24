import type { LarkRecord } from '../../../../shared/types';
import { normalizeFields, serializeFields } from '../../helpers/normalizeFields';
import type { RecordOperation } from './types';

export const createRecord: RecordOperation = async ({ client, path, fields, metadata }) => {
	const payload = serializeFields(normalizeFields(fields, await metadata()));
	const data = await client.request<{ record: LarkRecord }>({
		method: 'POST',
		path: `${path}/records`,
		operation: 'tạo bản ghi',
		qs: { user_id_type: 'open_id' },
		body: payload,
	});
	if (!data.record?.record_id)
		throw new Error(
			'Lark không trả về Record ID sau khi tạo; hãy kiểm tra Base trước khi chạy lại để tránh trùng dữ liệu.',
		);
	return [data.record];
};
