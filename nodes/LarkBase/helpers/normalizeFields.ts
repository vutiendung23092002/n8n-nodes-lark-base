import type { IDataObject } from 'n8n-workflow';
import type { LarkField } from '../../../shared/types';

export function parseJsonValue(input: unknown, label: string): unknown {
	if (typeof input !== 'string') return input;
	try {
		return JSON.parse(input) as unknown;
	} catch {
		throw new Error(`${label} không phải JSON hợp lệ. Hãy kiểm tra dấu ngoặc và dấu nháy kép.`);
	}
}

export function requireObject(input: unknown, label: string): Record<string, unknown> {
	if (!input || typeof input !== 'object' || Array.isArray(input)) {
		throw new Error(`${label} phải là một đối tượng JSON.`);
	}
	return input as Record<string, unknown>;
}

function invalid(field: LarkField, format: string): never {
	throw new Error(`Trường “${field.field_name}” cần ${format}.`);
}

export function normalizeDate(value: unknown, field: LarkField): number {
	if (
		typeof value === 'number' &&
		Number.isSafeInteger(value) &&
		Math.abs(value) <= 8640000000000000
	) {
		return value;
	}
	if (typeof value === 'string') {
		const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
		const withZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(
			value,
		);
		const day = value.slice(0, 10);
		const validDay =
			(dateOnly || withZone) &&
			Number.isFinite(Date.parse(`${day}T00:00:00Z`)) &&
			new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
		const time = value.slice(11, 19);
		const validTime =
			dateOnly ||
			(Number(time.slice(0, 2)) < 24 &&
				Number(time.slice(3, 5)) < 60 &&
				Number(time.slice(6, 8)) < 60);
		if (validDay && validTime) {
			const timestamp = Date.parse(dateOnly ? `${value}T00:00:00Z` : value);
			if (Number.isFinite(timestamp)) return timestamp;
		}
	}
	return invalid(field, 'timestamp mili giây, ngày YYYY-MM-DD (UTC), hoặc ISO 8601 có múi giờ');
}

function normalizeSelect(value: unknown, field: LarkField): string {
	if (typeof value !== 'string' || !value) return invalid(field, 'tên lựa chọn không rỗng');
	const options = field.property?.options;
	if (options && !options.some((option) => option.name === value)) {
		return invalid(field, 'tên lựa chọn đã tồn tại trong bảng; hãy tạo lựa chọn trên Lark trước');
	}
	return value;
}

function normalizeUrl(value: unknown, field: LarkField): IDataObject {
	const raw =
		typeof value === 'string'
			? { link: value, text: value }
			: requireObject(value, field.field_name);
	if (typeof raw.link !== 'string' || (raw.text !== undefined && typeof raw.text !== 'string')) {
		return invalid(field, 'URL hoặc đối tượng {link, text}');
	}
	try {
		const url = new URL(raw.link);
		if (!['https:', 'http:'].includes(url.protocol)) return invalid(field, 'URL HTTP hoặc HTTPS');
	} catch {
		return invalid(field, 'URL HTTP hoặc HTTPS hợp lệ');
	}
	return { link: raw.link, ...(raw.text === undefined ? {} : { text: raw.text }) };
}

function normalizeReferences(
	value: unknown,
	field: LarkField,
	key: 'id' | 'file_token',
): IDataObject[] {
	if (!Array.isArray(value)) return invalid(field, `mảng đối tượng có ${key}`);
	return value.map((entry: unknown) => {
		const object = requireObject(entry, field.field_name);
		if (typeof object[key] !== 'string' || !object[key])
			return invalid(field, `mảng đối tượng có ${key} không rỗng`);
		return { [key]: object[key] };
	});
}

function normalizeValue(value: unknown, field: LarkField): IDataObject[string] {
	const supported = [1, 2, 3, 4, 5, 7, 11, 13, 15, 17, 18, 21];
	if (!supported.includes(field.type)) {
		throw new Error(
			`Trường “${field.field_name}” có kiểu ${field.type} chỉ đọc hoặc chưa được hỗ trợ ghi. Hãy bỏ trường này khỏi dữ liệu gửi.`,
		);
	}
	if (value === null) return null;
	switch (field.type) {
		case 1:
		case 13:
			return typeof value === 'string' ? value : invalid(field, 'chuỗi văn bản');
		case 2: {
			const number =
				typeof value === 'string' && /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(value.trim())
					? Number(value)
					: value;
			return typeof number === 'number' && Number.isFinite(number)
				? number
				: invalid(field, 'số hữu hạn');
		}
		case 3:
			return normalizeSelect(value, field);
		case 4:
			if (!Array.isArray(value)) return invalid(field, 'mảng tên lựa chọn');
			return [...new Set(value.map((entry: unknown) => normalizeSelect(entry, field)))];
		case 5:
			return normalizeDate(value, field);
		case 7:
			if (typeof value === 'boolean') return value;
			if (value === 'true') return true;
			if (value === 'false') return false;
			return invalid(field, 'boolean true/false hoặc chuỗi "true"/"false"');
		case 11:
			return normalizeReferences(value, field, 'id');
		case 15:
			return normalizeUrl(value, field);
		case 17:
			return normalizeReferences(value, field, 'file_token');
		case 18:
		case 21:
			if (
				!Array.isArray(value) ||
				!value.every((id: unknown) => typeof id === 'string' && /^rec[a-zA-Z0-9]+$/.test(id))
			) {
				return invalid(field, 'mảng Record ID liên kết');
			}
			return [...value] as string[];
		default:
			return invalid(field, 'kiểu dữ liệu được hỗ trợ');
	}
}

export function normalizeFields(input: unknown, metadata: readonly LarkField[]): IDataObject {
	const fields = requireObject(input, 'Fields');
	if (!Object.keys(fields).length) throw new Error('Fields phải có ít nhất một trường cần ghi.');
	const schema = new Map(metadata.map((field) => [field.field_name, field]));
	return Object.fromEntries(
		Object.entries(fields).map(([name, value]) => {
			const field = schema.get(name);
			if (!field)
				throw new Error(
					`Không tìm thấy trường “${name}” trong bảng. Hãy dùng đúng tên cột trên Lark.`,
				);
			if (value === undefined)
				throw new Error(
					`Trường “${name}” có giá trị undefined; hãy bỏ trường hoặc dùng null để xóa giá trị.`,
				);
			return [name, normalizeValue(value, field)];
		}),
	);
}

export function serializeFields(fields: IDataObject): { fields: IDataObject } {
	// Chỉ gửi các khóa được cung cấp; không thêm giá trị mặc định làm ghi đè cột khác.
	return { fields };
}
