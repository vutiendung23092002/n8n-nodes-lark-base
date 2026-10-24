import type { IDataObject } from 'n8n-workflow';
import { chunkItems } from '../../../../shared/batch';
import { normalizeFields, requireObject, serializeFields } from '../../helpers/normalizeFields';
import { validateId } from '../../helpers/parseBaseUrl';
import type { RecordOperation } from './types';

type BatchMode = 'create' | 'update' | 'delete';

export function batchOperation(mode: BatchMode): RecordOperation {
	return async ({ client, path, records = [], metadata, batchSize, continueOnFail }) => {
		if (!records.length) throw new Error('Danh sách bản ghi theo lô không được rỗng.');
		const schema = mode === 'delete' ? [] : await metadata();
		// Kiểm tra toàn bộ đầu vào trước khi ghi lô đầu tiên để tránh lỗi định dạng giữa chừng.
		const prepared = records.map((entry) => {
			if (mode === 'delete') {
				if (typeof entry !== 'string')
					throw new Error('Mỗi phần tử xóa theo lô phải là một Record ID.');
				return validateId(entry, 'rec');
			}
			const record = requireObject(entry, 'Bản ghi trong lô');
			const payload = serializeFields(normalizeFields(record.fields, schema));
			if (mode === 'create') return payload;
			if (typeof record.record_id !== 'string')
				throw new Error('Mỗi bản ghi cập nhật theo lô cần record_id.');
			return { record_id: validateId(record.record_id, 'rec'), ...payload };
		});
		const output: IDataObject[] = [];
		const chunks = chunkItems(prepared, batchSize);
		for (const [index, chunk] of chunks.entries()) {
			try {
				const data = await client.request<{ records?: IDataObject[] }>({
					method: 'POST',
					path: `${path}/records/batch_${mode}`,
					operation: `${mode === 'create' ? 'tạo' : mode === 'update' ? 'cập nhật' : 'xóa'} bản ghi, lô ${index + 1}/${chunks.length}`,
					qs: mode === 'delete' ? {} : { user_id_type: 'open_id' },
					body: { records: chunk },
				});
				if (!Array.isArray(data.records) || data.records.length !== chunk.length) {
					throw new Error(
						'Lark trả về số lượng kết quả không khớp; hãy kiểm tra Base trước khi chạy lại.',
					);
				}
				if (
					data.records.some(
						(record) =>
							typeof record.record_id !== 'string' ||
							!record.record_id ||
							(mode === 'delete' && typeof record.deleted !== 'boolean'),
					)
				) {
					throw new Error(
						'Lark chưa trả đủ Record ID hoặc trạng thái xóa. Hãy kiểm tra Base trước khi chạy lại.',
					);
				}
				let ordered = data.records;
				if (mode !== 'create') {
					const byId = new Map(data.records.map((record) => [record.record_id, record]));
					ordered = chunk.map((entry) => {
						const id =
							typeof entry === 'string'
								? entry
								: 'record_id' in entry
									? entry.record_id
									: undefined;
						const record = byId.get(id);
						if (!record)
							throw new Error('Lark trả về kết quả thiếu Record ID đã gửi. Hãy kiểm tra Base.');
						return record;
					});
				}
				output.push(...ordered);
			} catch (error) {
				const message = `Lô ${index + 1}/${chunks.length}, vị trí ${index * batchSize + 1}–${index * batchSize + chunk.length}: ${error instanceof Error ? error.message : 'Lỗi xử lý lô.'} Các lô trước có thể đã được ghi thành công.`;
				if (!continueOnFail) throw new Error(message);
				output.push(
					...chunk.map((entry, offset) => ({
						error: message,
						batch_index: index,
						record_index: index * batchSize + offset,
						...(typeof entry === 'string'
							? { record_id: entry }
							: 'record_id' in entry
								? { record_id: entry.record_id }
								: {}),
					})),
				);
			}
		}
		return output;
	};
}
