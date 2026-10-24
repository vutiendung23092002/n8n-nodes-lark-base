import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { LarkBase } from '../nodes/LarkBase/v1/LarkBase.node.ts';
import { LarkAccessToken } from '../nodes/LarkAccessToken/LarkAccessToken.node.ts';
import { VutiendungLarkApi } from '../credentials/VutiendungLarkApi.credentials';

test('Credential cài chung với Bizflow không ghi đè larkApi dù thứ tự nạp thay đổi', () => {
	// Schema đối chiếu từ n8n-nodes-bizflow@1.1.1: secret nằm ở appToken.
	const bizflow = {
		name: 'larkApi',
		displayName: 'Lark API',
		properties: [{ name: 'appId' }, { name: 'appToken' }],
	};
	const own = new VutiendungLarkApi();
	for (const entries of [
		[bizflow, own],
		[own, bizflow],
	]) {
		// Registry n8n lập chỉ mục theo name, không thêm scope package cho credential.
		const registry = Object.fromEntries(entries.map((entry) => [entry.name, entry]));
		assert.equal(registry.larkApi, bizflow);
		assert.deepEqual(
			registry.larkApi.properties.map(({ name }) => name),
			['appId', 'appToken'],
		);
		assert.equal(registry.vutiendungLarkApi, own);
		assert.equal(own.displayName, 'Lark API (Vutiendung)');
		assert.equal(
			own.properties.some(({ name }) => name === 'appSecret'),
			true,
		);
		for (const node of [new LarkBase(), new LarkAccessToken()]) {
			assert.deepEqual(
				node.description.credentials!.map(({ name }) => name),
				[own.name],
			);
		}
	}
});

test('Cài cùng Bizflow không trùng tên hiển thị trong schema SQLite còn khóa duy nhất theo name', () => {
	const database = new DatabaseSync(':memory:');
	try {
		// Mô phỏng ràng buộc thực tế server báo; các schema n8n mới có thể chỉ dùng type làm khóa.
		database.exec(
			'CREATE TABLE installed_nodes (name TEXT NOT NULL UNIQUE, type TEXT PRIMARY KEY)',
		);
		const save = database.prepare('INSERT INTO installed_nodes (name, type) VALUES (?, ?)');
		save.run('Lark Base', 'n8n-nodes-bizflow.larkBase');
		assert.throws(
			() => save.run('Lark Base', '@vutiendung/n8n-nodes-lark-base.larkBase'),
			/UNIQUE constraint failed: installed_nodes.name/,
		);
		const { description } = new LarkBase();
		save.run(description.displayName, `@vutiendung/n8n-nodes-lark-base.${description.name}`);
		assert.equal(database.prepare('SELECT COUNT(*) AS total FROM installed_nodes').get()?.total, 2);
		assert.equal(description.name, 'larkBase');
	} finally {
		database.close();
	}
});

test('Tên mặc định giúp phân biệt node package này trong danh sách tìm kiếm và workflow', () => {
	const { description } = new LarkBase();
	assert.equal(description.displayName, 'Lark Base (Vutiendung)');
	assert.equal(description.defaults.name, 'Lark Base (Vutiendung)');
});
