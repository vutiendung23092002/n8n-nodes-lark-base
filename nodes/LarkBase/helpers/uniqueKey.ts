import type { IDataObject } from 'n8n-workflow';
import type { LarkField, LarkRecord } from '../../../shared/types';
import { normalizeFields, requireObject } from './normalizeFields';

export const uniqueOperations = [
	'upsert',
	'batchUpsert',
	'updateByUniqueKey',
	'deleteByUniqueKey',
	'checkDuplicates',
];
export interface UniqueKey {
	value: string | number;
	identity: string;
	filterValue: string;
}
export interface PreparedUniqueRecord {
	key: UniqueKey;
	fields: IDataObject;
	index: number;
}

export class UniqueKeyError extends Error {
	constructor(
		message: string,
		readonly details: IDataObject = {},
	) {
		super(message);
		this.name = 'UniqueKeyError';
	}
}

export function uniqueErrorItem(error: unknown, extra: IDataObject = {}): IDataObject {
	return {
		...(error instanceof UniqueKeyError ? error.details : {}),
		...extra,
		error:
			error instanceof Error
				? error.message
				: 'Không thể xác định kết quả thao tác theo Unique Key.',
	};
}

export function isUniqueField(field: LarkField): boolean {
	return (
		[1, 2].includes(field.type) &&
		!['Formula', 'Lookup', 'AutoNumber'].includes(field.ui_type ?? '')
	);
}

export function selectUniqueField(schema: LarkField[], name: unknown): LarkField {
	const field = schema.find((candidate) => candidate.field_name === name);
	if (!field || !isUniqueField(field))
		throw new UniqueKeyError(
			'Unique Key Field cần là cột Text hoặc Number có thể ghi trong bảng đã chọn.',
		);
	return field;
}

export function rawUniqueValue(value: unknown): string | number {
	if (typeof value === 'string' && value.trim()) return value;
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	throw new UniqueKeyError(
		'Unique Key không được null, undefined, rỗng, chỉ có khoảng trắng hoặc là dữ liệu phức tạp.',
	);
}

export function normalizeUniqueKey(value: unknown, field: LarkField): UniqueKey {
	const raw = rawUniqueValue(value);
	const normalized = normalizeFields({ [field.field_name]: raw }, [field])[field.field_name];
	if (typeof normalized !== 'string' && typeof normalized !== 'number')
		throw new UniqueKeyError('Unique Key chỉ hỗ trợ Text hoặc Number.');
	if (
		typeof normalized === 'number' &&
		Number.isInteger(normalized) &&
		!Number.isSafeInteger(normalized)
	)
		throw new UniqueKeyError(
			'Unique Key dạng Number vượt độ chính xác số nguyên an toàn; hãy dùng cột Text cho mã định danh dài.',
		);
	if (
		typeof normalized === 'number' &&
		typeof raw === 'string' &&
		decimalIdentity(raw) !== decimalIdentity(String(normalized))
	)
		throw new UniqueKeyError(
			'Unique Key dạng Number bị mất chữ số khi chuẩn hóa; hãy dùng Text để giữ nguyên mã định danh.',
		);
	return {
		value: normalized,
		identity: JSON.stringify([field.type, normalized]),
		filterValue: String(normalized),
	};
}

function decimalIdentity(value: string): string {
	const text = value.trim().toLowerCase();
	const [mantissa, rawExponent] = text.replace(/^[+-]/, '').split('e');
	const [whole, fraction = ''] = mantissa.split('.');
	let digits = (whole + fraction).replace(/^0+/, '');
	if (!digits) return '0';
	let exponent = Number(rawExponent ?? 0) - fraction.length;
	while (digits.endsWith('0')) {
		digits = digits.slice(0, -1);
		exponent++;
	}
	return `${text.startsWith('-') ? '-' : ''}${digits}e${exponent}`;
}

export function recordUniqueKey(record: LarkRecord, field: LarkField): UniqueKey {
	const fields = requireObject(record.fields, 'Fields trong phản hồi lookup');
	let raw: unknown = fields[field.field_name];
	if (field.type === 1 && Array.isArray(raw)) {
		if (
			!raw.every((part: unknown) => {
				const item = requireObject(part, 'Đoạn văn bản của Unique Key');
				return typeof item.text === 'string' && (item.type === undefined || item.type === 'text');
			})
		)
			throw new UniqueKeyError(
				'Unique Key Text trong phản hồi Lark có cấu trúc không được hỗ trợ.',
			);
		raw = raw.map((part: { text: string }) => part.text).join('');
	}
	return normalizeUniqueKey(raw, field);
}

export function prepareUniqueRecords(
	input: unknown[],
	field: LarkField,
	schema: LarkField[],
): PreparedUniqueRecord[] {
	if (!input.length) throw new UniqueKeyError('Danh sách Batch Upsert không được rỗng.');
	const seen = new Set<string>();
	return input.map((entry, index) => {
		const record = requireObject(entry, 'Bản ghi Upsert');
		const rawFields = requireObject(record.fields, 'Fields');
		const key = normalizeUniqueKey(rawFields[field.field_name], field);
		if (seen.has(key.identity))
			throw new UniqueKeyError(
				`Unique Key ${JSON.stringify(key.value)} bị trùng trong input. Không thực hiện lookup hoặc ghi.`,
				{ unique_key: key.value, record_index: index },
			);
		seen.add(key.identity);
		return { key, fields: normalizeFields(rawFields, schema), index };
	});
}

export function duplicateError(key: UniqueKey, records: LarkRecord[]): UniqueKeyError {
	return new UniqueKeyError(
		`Unique Key ${JSON.stringify(key.value)} có ${records.length} bản ghi trên Lark Base. Không thể xác định bản ghi cần cập nhật.`,
		{
			unique_key: key.value,
			duplicate_count: records.length,
			record_ids: records.map(({ record_id }) => record_id),
			lookup_status: 'duplicate',
		},
	);
}
