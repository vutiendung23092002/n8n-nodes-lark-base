import type { IDataObject } from 'n8n-workflow';
import type { LarkField, LarkPage, LarkRecord } from '../../../../shared/types';
import { chunkItems } from '../../../../shared/batch';
import { paginateLarkApi } from '../../../../shared/pagination';
import { validateId } from '../../helpers/parseBaseUrl';
import {
	duplicateError,
	normalizeUniqueKey,
	prepareUniqueRecords,
	recordUniqueKey,
	selectUniqueField,
	UniqueKeyError,
	uniqueErrorItem,
	type PreparedUniqueRecord,
} from '../../helpers/uniqueKey';
import {
	lookupByUniqueKey,
	lookupUniqueKeys,
	validateLookupRecord,
	type UniqueLookupResult,
} from '../../helpers/uniqueLookup';
import type { RecordContext, RecordOperation } from './types';

async function prepare(
	context: RecordContext,
	mode: string,
): Promise<{ field: LarkField; entries: PreparedUniqueRecord[] }> {
	const schema = await context.metadata();
	const field = selectUniqueField(schema, context.uniqueKeyField);
	const entries =
		context.uniquePrepared ??
		(mode === 'deleteByUniqueKey'
			? [{ key: normalizeUniqueKey(context.uniqueKeyValue, field), fields: {}, index: 0 }]
			: prepareUniqueRecords(
					mode === 'batchUpsert' ? (context.records ?? []) : [{ fields: context.fields }],
					field,
					schema,
				));
	return { field, entries };
}

function lookupOrThrow(
	result: UniqueLookupResult | undefined,
	entry: PreparedUniqueRecord,
): UniqueLookupResult {
	if (!result)
		throw new UniqueKeyError('Lookup thiếu trạng thái; không được ghi dữ liệu.', {
			unique_key: entry.key.value,
			lookup_status: 'failed',
		});
	if (result.status === 'duplicate') throw duplicateError(entry.key, result.records);
	return result;
}

export function uniqueOperation(
	mode: 'upsert' | 'updateByUniqueKey' | 'deleteByUniqueKey',
): RecordOperation {
	return async (context) => {
		const {
			field,
			entries: [entry],
		} = await prepare(context, mode);
		let lookupStatus = 'failed';
		let writing = false;
		try {
			const state = await lookupByUniqueKey(context.client, context.path, field, entry.key);
			lookupStatus = state.status;
			const lookup = lookupOrThrow(state, entry);
			if (lookup.status === 'not_found' && mode !== 'upsert')
				throw new UniqueKeyError(
					`Không tìm thấy Unique Key ${JSON.stringify(entry.key.value)}; không thực hiện ${mode === 'deleteByUniqueKey' ? 'xóa' : 'cập nhật'}.`,
					{ lookup_status: 'not_found' },
				);
			if (lookup.status === 'found' && mode === 'deleteByUniqueKey') {
				writing = true;
				const data = await context.client.request<{ record_id?: string; deleted?: boolean }>({
					method: 'DELETE',
					path: `${context.path}/records/${lookup.record.record_id}`,
					operation: 'xóa theo Unique Key',
				});
				if (
					data.deleted !== true ||
					(data.record_id !== undefined && data.record_id !== lookup.record.record_id)
				)
					throw new UniqueKeyError(
						'Lark chưa xác nhận đúng bản ghi được xóa; kiểm tra Base trước khi chạy lại.',
					);
				return [
					{
						record_id: lookup.record.record_id,
						deleted: true,
						action: 'deleted',
						unique_key: entry.key.value,
					},
				];
			}
			const found = lookup.status === 'found';
			writing = true;
			const data = await context.client.request<{ record: LarkRecord }>({
				method: found ? 'PUT' : 'POST',
				path: found
					? `${context.path}/records/${lookup.record.record_id}`
					: `${context.path}/records`,
				operation: found ? 'cập nhật theo Unique Key' : 'tạo theo Unique Key sau lookup NOT_FOUND',
				qs: { user_id_type: 'open_id' },
				body: { fields: entry.fields },
			});
			const record = validateLookupRecord(data.record);
			if (
				(found && record.record_id !== lookup.record.record_id) ||
				recordUniqueKey(record, field).identity !== entry.key.identity
			)
				throw new UniqueKeyError(
					'Kết quả ghi không khớp Record ID/Unique Key đã gửi; kiểm tra Base trước khi chạy lại.',
				);
			return [{ ...record, action: found ? 'updated' : 'created', unique_key: entry.key.value }];
		} catch (error) {
			throw new UniqueKeyError(
				error instanceof Error ? error.message : 'Không xác định được trạng thái ghi theo khóa.',
				{
					lookup_status: lookupStatus,
					...uniqueErrorItem(error),
					unique_key: entry.key.value,
					...(writing ? { write_status: 'unconfirmed' } : {}),
				},
			);
		}
	};
}

export const batchUpsert: RecordOperation = async (context) => {
	const { field, entries } = await prepare(context, 'batchUpsert');
	// Kiểm tra batchSize trước lookup và trước mọi thao tác ghi.
	chunkItems([], context.batchSize);
	let results: Map<string, UniqueLookupResult>;
	try {
		results = await lookupUniqueKeys(
			context.client,
			context.path,
			field,
			entries.map(({ key }) => key),
		);
		for (const entry of entries) lookupOrThrow(results.get(entry.key.identity), entry);
	} catch (error) {
		if (!context.continueOnFail) throw error;
		return entries.map((entry) =>
			uniqueErrorItem(error, {
				unique_key: entry.key.value,
				record_index: entry.index,
				lookup_status:
					error instanceof UniqueKeyError &&
					error.details.unique_key === entry.key.value &&
					error.details.lookup_status === 'duplicate'
						? 'duplicate'
						: 'failed',
				...(error instanceof UniqueKeyError && error.details.unique_key !== entry.key.value
					? { duplicate_count: undefined, record_ids: undefined }
					: {}),
			}),
		);
	}
	const updates: Array<{ entry: PreparedUniqueRecord; recordId: string }> = [];
	const creates: PreparedUniqueRecord[] = [];
	for (const entry of entries) {
		const state = results.get(entry.key.identity)!;
		if (state.status === 'found') updates.push({ entry, recordId: state.record.record_id });
		else if (state.status === 'not_found') creates.push(entry);
		else throw duplicateError(entry.key, state.records);
	}
	const output: Array<IDataObject | undefined> = Array(entries.length);
	// Tất cả lookup phải đạt trước ghi. Ghi tuần tự; lỗi ghi dừng các lô còn lại kể cả Continue On Fail.
	try {
		for (const group of chunkItems(updates, context.batchSize)) {
			const data = await context.client.request<{ records?: unknown[] }>({
				method: 'POST',
				path: `${context.path}/records/batch_update`,
				operation: 'Batch Upsert: cập nhật bản ghi đã tìm thấy',
				qs: { user_id_type: 'open_id' },
				body: {
					records: group.map(({ entry, recordId }) => ({
						record_id: recordId,
						fields: entry.fields,
					})),
				},
			});
			if (!Array.isArray(data.records) || data.records.length !== group.length)
				throw new UniqueKeyError(
					'Số kết quả Batch Update không khớp; trạng thái ghi không xác định.',
				);
			const records = data.records.map(validateLookupRecord);
			const byId = new Map(records.map((record) => [record.record_id, record]));
			if (byId.size !== group.length) throw new UniqueKeyError('Batch Update trả lặp Record ID.');
			const confirmed = group.map(({ entry, recordId }) => {
				const record = byId.get(recordId);
				if (!record || recordUniqueKey(record, field).identity !== entry.key.identity)
					throw new UniqueKeyError('Batch Update không khớp Unique Key/Record ID đã gửi.');
				return { entry, record };
			});
			for (const { entry, record } of confirmed)
				output[entry.index] = {
					...record,
					action: 'updated',
					unique_key: entry.key.value,
					record_index: entry.index,
				};
		}
		for (const group of chunkItems(creates, context.batchSize)) {
			const data = await context.client.request<{ records?: unknown[] }>({
				method: 'POST',
				path: `${context.path}/records/batch_create`,
				operation: 'Batch Upsert: tạo bản ghi sau lookup NOT_FOUND',
				qs: { user_id_type: 'open_id' },
				body: { records: group.map(({ fields }) => ({ fields })) },
			});
			if (!Array.isArray(data.records) || data.records.length !== group.length)
				throw new UniqueKeyError(
					'Số kết quả Batch Create không khớp; trạng thái ghi không xác định.',
				);
			const records = data.records.map(validateLookupRecord);
			const byKey = new Map(
				records.map((record) => [recordUniqueKey(record, field).identity, record]),
			);
			if (
				byKey.size !== group.length ||
				new Set(records.map(({ record_id }) => record_id)).size !== group.length
			)
				throw new UniqueKeyError('Batch Create trả Unique Key/Record ID trùng.');
			const confirmed = group.map((entry) => {
				const record = byKey.get(entry.key.identity);
				if (!record) throw new UniqueKeyError('Batch Create thiếu Unique Key đã gửi.');
				return { entry, record };
			});
			for (const { entry, record } of confirmed)
				output[entry.index] = {
					...record,
					action: 'created',
					unique_key: entry.key.value,
					record_index: entry.index,
				};
		}
	} catch (error) {
		const message = `${error instanceof Error ? error.message : 'Lỗi Batch Upsert.'} Đã dừng ghi các lô còn lại; một số lô trước hoặc lô lỗi có thể đã được ghi. Kiểm tra Base trước khi chạy lại.`;
		if (!context.continueOnFail) throw new UniqueKeyError(message);
		return entries.map(
			(entry) =>
				output[entry.index] ?? {
					error: message,
					unique_key: entry.key.value,
					record_index: entry.index,
					write_status: 'unconfirmed_or_not_attempted',
				},
		);
	}
	return output.map((item) => {
		if (!item)
			throw new UniqueKeyError('Batch Upsert thiếu kết quả; không xác định được trạng thái ghi.');
		return item;
	});
};

export const checkDuplicates: RecordOperation = async ({
	client,
	path,
	uniqueKeyField,
	metadata,
}) => {
	const field = selectUniqueField(await metadata(), uniqueKeyField);
	const records = await paginateLarkApi<unknown>(
		(pageToken, pageSize) =>
			client.request<LarkPage<unknown>>({
				method: 'POST',
				path: `${path}/records/search`,
				operation: 'kiểm tra Unique Key trùng toàn bảng',
				qs: {
					page_size: pageSize,
					user_id_type: 'open_id',
					...(pageToken ? { page_token: pageToken } : {}),
				},
				body: { field_names: [field.field_name] },
			}),
		{ returnAll: true, strict: true },
	);
	const groups = new Map<string, { value: string | number; ids: string[] }>();
	const ids = new Set<string>();
	for (const raw of records) {
		const record = validateLookupRecord(raw);
		validateId(record.record_id, 'rec');
		if (ids.has(record.record_id))
			throw new UniqueKeyError('Scan duplicate trả Record ID lặp; không thể xác nhận kết quả.');
		ids.add(record.record_id);
		const rawValue = record.fields[field.field_name];
		// Bản ghi không có business key không được coi là một nhóm khóa hợp lệ.
		if (
			rawValue === undefined ||
			rawValue === null ||
			(typeof rawValue === 'string' && !rawValue.trim()) ||
			(Array.isArray(rawValue) && !rawValue.length)
		)
			continue;
		const key = recordUniqueKey(record, field);
		const group = groups.get(key.identity) ?? { value: key.value, ids: [] };
		group.ids.push(record.record_id);
		groups.set(key.identity, group);
	}
	return [...groups.values()]
		.filter(({ ids: recordIds }) => recordIds.length > 1)
		.map(({ value, ids: recordIds }) => ({
			unique_key: value,
			count: recordIds.length,
			record_ids: recordIds,
		}));
};
