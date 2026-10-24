import type { LarkRecord } from '../../../../shared/types';
import { normalizeFields, serializeFields } from '../../helpers/normalizeFields';
import type { RecordOperation } from './types';

export const updateRecord: RecordOperation = async ({
	client,
	path,
	recordId,
	fields,
	metadata,
}) => {
	const payload = serializeFields(normalizeFields(fields, await metadata()));
	const data = await client.request<{ record: LarkRecord }>({
		method: 'PUT',
		path: `${path}/records/${recordId}`,
		operation: 'cập nhật bản ghi',
		qs: { user_id_type: 'open_id' },
		body: payload,
	});
	if (!data.record?.record_id)
		throw new Error(
			'Lark không trả về bản ghi sau khi cập nhật. Hãy kiểm tra Base trước khi chạy lại.',
		);
	return [data.record];
};
