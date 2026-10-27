import type { LarkClient, LarkField, LarkPage, LarkRecord } from '../../../shared/types';
import { paginateLarkApi } from '../../../shared/pagination';
import { requireObject } from './normalizeFields';
import { validateId } from './parseBaseUrl';
import { recordUniqueKey, type UniqueKey, UniqueKeyError } from './uniqueKey';

export type UniqueLookupResult =
	| { status: 'not_found' }
	| { status: 'found'; record: LarkRecord }
	| { status: 'duplicate'; records: LarkRecord[] };

export function validateLookupRecord(input: unknown): LarkRecord {
	const record = requireObject(input, 'Bản ghi trong phản hồi lookup');
	if (typeof record.record_id !== 'string')
		throw new UniqueKeyError('Phản hồi lookup thiếu Record ID; không được Create.');
	validateId(record.record_id, 'rec');
	requireObject(record.fields, 'Fields trong phản hồi lookup');
	return record as LarkRecord;
}

// Chọn mức nội bộ nhỏ; không dựa vào giới hạn tối đa chưa xác minh của tenant.
const lookupChunkSize = 10;
const maxFilterBytes = 16000;

export async function lookupUniqueKeys(
	client: LarkClient,
	path: string,
	field: LarkField,
	keys: UniqueKey[],
): Promise<Map<string, UniqueLookupResult>> {
	const result = new Map<string, UniqueLookupResult>();
	const seenIds = new Set<string>();
	const chunks: UniqueKey[][] = [];
	let chunk: UniqueKey[] = [];
	const filterFor = (items: UniqueKey[]) => ({
		conjunction: 'or',
		conditions: items.map((key) => ({
			field_name: field.field_name,
			operator: 'is',
			value: [key.filterValue],
		})),
	});
	for (const key of keys) {
		if (new TextEncoder().encode(JSON.stringify(filterFor([key]))).length > maxFilterBytes)
			throw new UniqueKeyError('Unique Key quá dài cho request lookup an toàn; không ghi dữ liệu.');
		if (
			chunk.length &&
			(chunk.length >= lookupChunkSize ||
				new TextEncoder().encode(JSON.stringify(filterFor([...chunk, key]))).length >
					maxFilterBytes)
		) {
			chunks.push(chunk);
			chunk = [];
		}
		chunk.push(key);
	}
	if (chunk.length) chunks.push(chunk);
	for (const group of chunks) {
		const byKey = new Map(group.map((key) => [key.identity, [] as LarkRecord[]]));
		const records = await paginateLarkApi<unknown>(
			(pageToken, pageSize) =>
				client.request<LarkPage<unknown>>({
					method: 'POST',
					path: `${path}/records/search`,
					operation: 'lookup chính xác theo Unique Key',
					qs: {
						user_id_type: 'open_id',
						page_size: pageSize,
						...(pageToken ? { page_token: pageToken } : {}),
					},
					// Không gửi view_id, filter/sort từ UI; lookup phải thấy toàn bộ dữ liệu app có quyền đọc.
					body: { field_names: [field.field_name], filter: filterFor(group) },
				}),
			{ returnAll: true, strict: true },
		);
		for (const raw of records) {
			const record = validateLookupRecord(raw);
			if (seenIds.has(record.record_id))
				throw new UniqueKeyError(
					'Lookup trả lặp Record ID qua các trang; trạng thái không xác định, không được ghi.',
				);
			seenIds.add(record.record_id);
			const key = recordUniqueKey(record, field);
			const matches = byKey.get(key.identity);
			if (!matches)
				throw new UniqueKeyError(
					'Lark trả Unique Key ngoài điều kiện lookup chính xác. Không được ghi dữ liệu.',
				);
			matches.push(record);
		}
		for (const [identity, matches] of byKey)
			result.set(
				identity,
				matches.length === 0
					? { status: 'not_found' }
					: matches.length === 1
						? { status: 'found', record: matches[0] }
						: { status: 'duplicate', records: matches },
			);
	}
	return result;
}

export async function lookupByUniqueKey(
	client: LarkClient,
	path: string,
	field: LarkField,
	key: UniqueKey,
): Promise<UniqueLookupResult> {
	const result = (await lookupUniqueKeys(client, path, field, [key])).get(key.identity);
	if (!result) throw new UniqueKeyError('Lookup thiếu trạng thái Unique Key; không được ghi.');
	return result;
}
