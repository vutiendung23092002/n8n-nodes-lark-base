import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseBaseUrl } from '../nodes/LarkBase/helpers/parseBaseUrl';

test('Đọc App Token trực tiếp và bỏ khoảng trắng bên ngoài', () => {
	assert.deepEqual(parseBaseUrl(' ABC123 '), { appToken: 'ABC123' });
});

for (const domain of ['example.larksuite.com', 'example.feishu.cn', 'example.larkoffice.com']) {
	test(`Đọc Base, bảng và view trên ${domain}`, () => {
		assert.deepEqual(
			parseBaseUrl(`https://${domain}/base/ABC123?table=tbl123&view=vew456&extra=1`),
			{
				appToken: 'ABC123',
				tableId: 'tbl123',
				viewId: 'vew456',
			},
		);
	});
}

test('URL không có query vẫn hợp lệ', () => {
	assert.deepEqual(parseBaseUrl('https://example.larksuite.com/base/ABC123/'), {
		appToken: 'ABC123',
	});
});

test('URL có bảng nhưng không có view', () => {
	assert.deepEqual(parseBaseUrl('https://example.feishu.cn/base/ABC123?table=tbl123'), {
		appToken: 'ABC123',
		tableId: 'tbl123',
	});
});

for (const value of [
	'https://example.larksuite.com/base/',
	'https://example.larksuite.com/base/ABC123/extra',
	'https://example.com/base/ABC123',
	'https://larksuite.com.evil.example/base/ABC123',
	'https://fakelarksuite.com/base/ABC123',
	'http://example.larksuite.com/base/ABC123',
	'https://user:secret@example.larksuite.com/base/ABC123',
	'https://example.larksuite.com:444/base/ABC123',
	'https://example.larksuite.com/base/ABC123?table=not-a-table',
	'https://example.larksuite.com/base/ABC123?view=not-a-view',
	'https://example.larksuite.com/base/ABC%2F123',
	'https://',
	'',
	'một URL sai',
]) {
	test(`Từ chối đầu vào không hợp lệ: ${value || '(rỗng)'}`, () => {
		assert.throws(() => parseBaseUrl(value));
	});
}

test('Không dùng nhầm Wiki token thành App Token', () => {
	assert.throws(() => parseBaseUrl('https://example.larksuite.com/wiki/ABC123'), /Wiki.*App Token/);
});
