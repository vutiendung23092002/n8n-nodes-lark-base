import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LarkField } from '../shared/types';
import { normalizeFields, serializeFields } from '../nodes/LarkBase/helpers/normalizeFields';

const schema: LarkField[] = [
	{ field_id: 'f1', field_name: 'Tên', type: 1 },
	{ field_id: 'f2', field_name: 'Số', type: 2 },
	{
		field_id: 'f3',
		field_name: 'Chọn',
		type: 3,
		property: { options: [{ name: 'A' }, { name: 'B' }] },
	},
	{
		field_id: 'f4',
		field_name: 'Nhiều',
		type: 4,
		property: { options: [{ name: 'A' }, { name: 'B' }] },
	},
	{ field_id: 'f5', field_name: 'Ngày', type: 5 },
	{ field_id: 'f7', field_name: 'Đúng', type: 7 },
	{ field_id: 'f11', field_name: 'Người', type: 11 },
	{ field_id: 'f13', field_name: 'Điện thoại', type: 13 },
	{ field_id: 'f15', field_name: 'URL', type: 15 },
	{ field_id: 'f17', field_name: 'Tệp', type: 17 },
	{ field_id: 'f18', field_name: 'Liên kết', type: 18 },
	{ field_id: 'f20', field_name: 'Công thức', type: 20 },
	{ field_id: 'f1001', field_name: 'Ngày tạo', type: 1001 },
];

test('Chuẩn hóa các kiểu phổ biến theo metadata', () => {
	const result = normalizeFields(
		{ Tên: 'An', Số: '1.25', Chọn: 'A', Nhiều: ['A', 'B', 'A'], Ngày: '2026-10-24', Đúng: 'false' },
		schema,
	);
	assert.deepEqual(result, {
		Tên: 'An',
		Số: 1.25,
		Chọn: 'A',
		Nhiều: ['A', 'B'],
		Ngày: Date.UTC(2026, 9, 24),
		Đúng: false,
	});
});

test('Ngày giờ có múi giờ và timestamp mili giây cho cùng kết quả', () => {
	const ms = Date.parse('2026-10-24T12:00:00+07:00');
	assert.deepEqual(normalizeFields({ Ngày: '2026-10-24T12:00:00+07:00' }, schema), { Ngày: ms });
	assert.deepEqual(normalizeFields({ Ngày: ms }, schema), { Ngày: ms });
});

for (const value of [
	'2026-02-30',
	'2026-10-24T12:00:00',
	'2026-10-24T24:00:00Z',
	'24/10/2026',
	'123',
	Infinity,
]) {
	test(`Từ chối ngày mơ hồ hoặc không tồn tại: ${value}`, () => {
		assert.throws(() => normalizeFields({ Ngày: value }, schema), /timestamp/);
	});
}

test('Update giữ nguyên tính chất bản vá, hỗ trợ null và không đổi input', () => {
	const input = { Tên: null, Đúng: false, Số: 0 };
	assert.deepEqual(serializeFields(normalizeFields(input, schema)), { fields: input });
	assert.equal(Object.hasOwn(normalizeFields(input, schema), 'Chọn'), false);
	assert.deepEqual(input, { Tên: null, Đúng: false, Số: 0 });
});

for (const fields of [
	{ Tên: {} },
	{ Số: '' },
	{ Số: true },
	{ Số: 'NaN' },
	{ Số: Infinity },
	{ Đúng: 'yes' },
	{ Đúng: 1 },
	{ Chọn: 'Mới' },
	{ Nhiều: 'A,B' },
	{ Nhiều: ['C'] },
	{ 'Cột lạ': 'x' },
	{ 'Công thức': 1 },
	{ 'Công thức': null },
	{ 'Ngày tạo': 0 },
	{ Tên: undefined },
]) {
	test(`Từ chối field không an toàn: ${JSON.stringify(fields)}`, () => {
		assert.throws(() => normalizeFields(fields, schema));
	});
}

test('Chấp nhận định dạng rõ ràng của người, tệp, URL và liên kết', () => {
	assert.deepEqual(
		normalizeFields(
			{
				Người: [{ id: 'ou_123', name: 'Tên chỉ để hiển thị' }],
				Tệp: [{ file_token: 'file123', url: 'không gửi lại metadata đọc' }],
				URL: 'https://example.com',
				'Liên kết': ['rec123'],
				'Điện thoại': '+84123456789',
			},
			schema,
		),
		{
			Người: [{ id: 'ou_123' }],
			Tệp: [{ file_token: 'file123' }],
			URL: { link: 'https://example.com', text: 'https://example.com' },
			'Liên kết': ['rec123'],
			'Điện thoại': '+84123456789',
		},
	);
});

test('Không đoán định dạng field phức tạp', () => {
	for (const fields of [
		{ Người: 'An' },
		{ Tệp: ['https://example.com'] },
		{ URL: 'javascript:alert(1)' },
		{ 'Liên kết': ['tbl123'] },
	]) {
		assert.throws(() => normalizeFields(fields, schema));
	}
});

test('Không cho phép input rỗng, mảng hay chuỗi thay đối tượng', () => {
	for (const input of [{}, [], null, 'chuỗi']) assert.throws(() => normalizeFields(input, schema));
});
