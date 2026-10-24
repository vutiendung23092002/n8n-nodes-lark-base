import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeFilterDate } from '../nodes/LarkBase/helpers/filterDate';
import { buildStructuredFilter } from '../nodes/LarkBase/helpers/filterBuilder';

const field = { field_id: 'fldCreated', field_name: 'Ngày tạo đơn', type: 5 };

test('Ngày từ bộ chọn n8n dùng múi giờ workflow cho cả dấu cách và T', () => {
	for (const input of ['2026-01-02 00:00:00', '2026-01-02T00:00:00', '2026-01-02']) {
		assert.equal(
			normalizeFilterDate(input, field, 'Asia/Ho_Chi_Minh'),
			Date.parse('2026-01-01T17:00:00Z'),
		);
		assert.equal(
			normalizeFilterDate(input, field, 'Asia/Bangkok'),
			Date.parse('2026-01-01T17:00:00Z'),
		);
		assert.equal(normalizeFilterDate(input, field, 'UTC'), Date.parse('2026-01-02T00:00:00Z'));
		assert.equal(
			normalizeFilterDate(input, field, 'Asia/Tokyo'),
			Date.parse('2026-01-01T15:00:00Z'),
		);
	}
});

test('Offset lẻ và DST được lấy theo ngày, không theo giờ hiện tại của máy chủ', () => {
	assert.equal(
		normalizeFilterDate('2026-01-02 00:00:00', field, 'Asia/Kathmandu'),
		Date.parse('2026-01-01T18:15:00Z'),
	);
	assert.equal(
		normalizeFilterDate('2026-01-02T00:00:00', field, 'America/New_York'),
		Date.parse('2026-01-02T05:00:00Z'),
	);
	assert.equal(
		normalizeFilterDate('2026-07-02T00:00:00', field, 'America/New_York'),
		Date.parse('2026-07-02T04:00:00Z'),
	);
});

test('ISO có Z/offset và timestamp không bị áp múi giờ lần nữa', () => {
	const expected = Date.parse('2026-01-01T17:00:00Z');
	for (const input of ['2026-01-02T00:00:00+07:00', '2026-01-01T17:00:00Z', expected]) {
		assert.equal(normalizeFilterDate(input, field, 'America/New_York'), expected);
	}
	assert.equal(normalizeFilterDate('2026-01-02T00:00:00.123+07:00', field, 'UTC'), expected + 123);
	assert.equal(
		normalizeFilterDate('2026-01-02T00:00:00.1', field, 'Asia/Ho_Chi_Minh'),
		expected + 100,
	);
});

test('Từ chối ngày sai, giờ bị chuẩn hóa và múi giờ không hợp lệ', () => {
	for (const input of [
		'',
		'02/01/2026',
		'2026-02-30 00:00:00',
		'2026-01-02T24:00:00',
		'2026-01-02 12:60:00',
	]) {
		assert.throws(() => normalizeFilterDate(input, field, 'Asia/Ho_Chi_Minh'), /Ngày tạo đơn/);
	}
	assert.throws(
		() => normalizeFilterDate('2026-01-02 00:00:00', field, 'Not/AZone'),
		/múi giờ workflow/,
	);
	assert.throws(
		() => normalizeFilterDate('2026-03-08 02:30:00', field, 'America/New_York'),
		/không tồn tại/,
	);
	assert.throws(
		() => normalizeFilterDate('2026-11-01 01:30:00', field, 'America/New_York'),
		/giờ bị lặp/,
	);
	assert.equal(
		normalizeFilterDate('2026-11-01T01:30:00-04:00', field, 'America/New_York'),
		Date.parse('2026-11-01T05:30:00Z'),
	);
});

test('Ngày trong ảnh lỗi tạo đúng ExactDate theo múi giờ workflow', async () => {
	const result = await buildStructuredFilter(
		{
			condition: [
				{
					fieldName: field.field_name,
					operator: 'isGreater',
					valueMode: 'date',
					datePreset: 'ExactDate',
					dateValue: '2026-01-02 00:00:00',
				},
			],
		},
		'and',
		async () => [field],
		'Asia/Ho_Chi_Minh',
	);
	assert.deepEqual(result, {
		conjunction: 'and',
		conditions: [
			{
				field_name: field.field_name,
				operator: 'isGreater',
				value: ['ExactDate', String(Date.parse('2026-01-01T17:00:00Z'))],
			},
		],
	});
});
