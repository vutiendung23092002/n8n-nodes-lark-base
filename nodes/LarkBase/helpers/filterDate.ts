import { DateTime } from 'luxon';
import type { LarkField } from '../../../shared/types';
import { normalizeDate } from './normalizeFields';

export function normalizeFilterDate(value: unknown, field: LarkField, timezone: string): number {
	if (typeof value !== 'string') return normalizeDate(value, field);
	const text = value.trim();
	// dateTime của n8n có thể trả giờ địa phương không có offset, bằng T hoặc dấu cách.
	const local = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?)?$/.exec(
		text,
	);
	if (!local) return normalizeDate(text, field);
	const parts = {
		year: Number(local[1]),
		month: Number(local[2]),
		day: Number(local[3]),
		hour: Number(local[4] ?? 0),
		minute: Number(local[5] ?? 0),
		second: Number(local[6] ?? 0),
		millisecond: Number((local[7] ?? '0').padEnd(3, '0')),
	};
	const date = DateTime.fromObject(parts, { zone: timezone });
	if (!date.isValid) {
		throw new Error(
			`Trường “${field.field_name}” có ngày giờ không hợp lệ hoặc múi giờ workflow “${timezone}” không được hỗ trợ.`,
		);
	}
	// Không để thư viện tự đổi 24:00 hoặc giờ không tồn tại khi chuyển giờ mùa hè.
	if (
		Object.entries(parts).some(
			([key, expected]) => date.get(key as keyof typeof parts) !== expected,
		)
	) {
		throw new Error(
			`Trường “${field.field_name}” có ngày giờ không tồn tại trong múi giờ “${timezone}”.`,
		);
	}
	if (date.getPossibleOffsets().length > 1) {
		throw new Error(
			`Trường “${field.field_name}” có giờ bị lặp khi đổi giờ mùa hè. Hãy dùng expression ISO 8601 có offset để xác định đúng thời điểm.`,
		);
	}
	return date.toMillis();
}
