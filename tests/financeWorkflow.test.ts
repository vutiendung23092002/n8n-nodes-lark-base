import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { Script, createContext } from 'node:vm';
// @ts-expect-error The migration tool is JavaScript and is not part of the published node API.
import { convertFinanceWorkflow, TEST_BASE } from '../scripts/migrate-tiktok-finance.mjs';
import type { IDataObject, IExecuteFunctions, IHttpRequestOptions } from 'n8n-workflow';
import { LarkBase } from '../nodes/LarkBase/v1/LarkBase.node.ts';

const template = JSON.parse(
	readFileSync(resolve('tests/fixtures/tiktok-finance-template.json'), 'utf8'),
);
const hostRequire = createRequire(resolve('package.json'));
const { useCommunityTikTokHmac, restoreTikTokAuthentication } = hostRequire(
	resolve('scripts/migrate-tiktok-finance.mjs'),
);
const names = [
	'Schedule Trigger',
	'Month',
	'Convert To Timestamp',
	'Get Encrypted Token Tiktok',
	'Get Token Tiktok',
	'Check access token',
	'1. If',
	'Get Encrypted Refresh Token Tiktok',
	'Get Refresh Token Tiktok',
	'Check Refresh Token',
	'3. If',
	'Agrument Refresh Token',
	'Refresh Token',
	'Encrypt Refreshed Token Tiktok',
	'Update Token Tiktok',
	'2. Stop and Error Refresh Token Tiktok',
	'Refresh Token Tiktok Expired',
	'1. Argument Get Shop',
	'1. Get Shop',
	'1. Get Statments',
	'Get Transaction By Statement',
	'Schema finance - Validate and Plan',
	'2. Argument Get Statment',
	'Argument Get Transaction',
	'Format Finance',
];
function source() {
	return {
		nodes: names.map((name, i) => ({
			id: `source${i}`,
			name,
			type: ['1. Get Shop', '1. Get Statments', 'Get Transaction By Statement'].includes(name)
				? 'n8n-nodes-base.httpRequest'
				: 'n8n-nodes-base.code',
			typeVersion: 2,
			position: [0, 0],
			parameters: {
				jsCode:
					name === 'Month'
						? template.month
						: name === 'Convert To Timestamp'
							? template.range
							: name === 'Schema finance - Validate and Plan'
								? `const expectedFields = ${JSON.stringify(template.fields, null, 2)};\nconst response = {};`
								: name === 'Format Finance'
									? template.formatter + '\nconst shop_id = null;'
									: name === '2. Argument Get Statment'
										? template.signing + '\nconst appKey = "test";'
										: 'return $input.all();',
			},
		})),
	};
}
const workflow = convertFinanceWorkflow(source());
const node = (name: string) => workflow.nodes.find((n: { name: string }) => n.name === name);
const range = {
	current_month: 10,
	current_year: 2026,
	statement_time_ge: 101,
	statement_time_lt: 201,
};
const shop = {
	code: 0,
	data: { shops: [{ id: 'shop1', name: 'Shop Test', cipher: 'test-cipher' }] },
};
function run(
	name: string,
	input: object[],
	references: Record<string, object> = {},
	selected = workflow,
) {
	const context = createContext({
		Buffer,
		require: () => {
			throw new Error('Module is disallowed in Code sandbox');
		},
		console: undefined,
		$input: { first: () => ({ json: input[0] }), all: () => input.map((json) => ({ json })) },
		$: (ref: string) => ({
			first: () => ({
				json: references[ref] ?? (ref === 'Month' ? range : ref === '1. Get Shop' ? shop : {}),
			}),
			item: { json: references[ref] ?? {} },
		}),
	});
	const result = new Script(
		`(function() { ${selected.nodes.find((n: { name: string }) => n.name === name).parameters.jsCode}\n })()`,
	).runInContext(context);
	return JSON.parse(JSON.stringify(result));
}
const response = (data: object) => ({ code: 0, data });
const key = 'ID định danh (TTS)';

test('Converted graph is inactive, pinned to test Base, has no global finance data or old Lark record writes', () => {
	assert.equal(workflow.active, false);
	assert.equal(node('Schedule Trigger').disabled, true);
	assert.deepEqual(workflow.pinData, {});
	assert.equal(
		new Set(workflow.nodes.map((n: { id: string }) => n.id)).size,
		workflow.nodes.length,
	);
	for (const [from, c] of Object.entries(workflow.connections)) {
		assert(node(from));
		for (const outputs of (c as { main: Array<Array<{ node: string }>> }).main)
			for (const connection of outputs ?? []) assert(node(connection.node), connection.node);
	}
	const json = JSON.stringify(workflow);
	assert(!json.includes('$getWorkflowStaticData'));
	assert(!json.includes('Fg8lbmhRuaDGBwsDbcKlCCf3g6b'));
	assert(!node('Search Order Lark'));
	assert(!node('Create Finance'));
	assert(!node('Update OR Create F'));
	assert.equal(node('Batch Upsert Finance').parameters.base, TEST_BASE);
	assert.equal(node('Batch Upsert Finance').retryOnFail, false);
	assert.equal(node('Batch Upsert Finance').parameters.uniqueKeyFieldManual, key);
	assert.equal(
		workflow.connections['Loop Over Statements'].main[1][0].node,
		'Argument Get Transaction',
	);
});

test('Bootstrap creates current year/month with all 49 original typed columns; no hardcoded old table IDs', () => {
	const [target] = run('Get Table Finance', [{}]);
	assert.equal(target.json.table_name, 'Finance_2026_10');
	assert.equal(target.json.expected_fields.length, 49);
	assert.equal(target.json.expected_fields[0].field_name, key);
	const [plan] = run('Finance Tables Plan', [response({ items: [], has_more: false })], {
		'Finance Table Request': target.json,
	});
	assert.equal(plan.json.table_exists, false);
	assert.equal(plan.json.has_more, false);
	assert(node('Lark Create Finance Table').parameters.jsonBody.includes('expected_fields'));
	const [created] = run('Finance Table Created', [response({ table_id: 'tblNew' })], {
		'Get Table Finance': target.json,
	});
	assert.equal(created.json.table_id, 'tblNew');
	assert.throws(() => run('Finance Table Request', [{ ...target.json, base_id: 'production' }]));
});

test('Table discovery completes pagination and rejects duplicate names / repeated or missing cursors / malformed responses', () => {
	const state = { base_id: TEST_BASE, table_name: 'Finance_2026_10' };
	const [first] = run(
		'Finance Tables Plan',
		[response({ items: [], has_more: true, page_token: 'next' })],
		{ 'Finance Table Request': state },
	);
	const [last] = run(
		'Finance Tables Plan',
		[response({ items: [{ name: state.table_name, table_id: 'tblA' }], has_more: false })],
		{ 'Finance Table Request': first.json },
	);
	assert.equal(last.json.table_id, 'tblA');
	for (const data of [
		{},
		{ items: [], has_more: true },
		{ items: [], has_more: true, page_token: 'next' },
		{
			items: [
				{ name: state.table_name, table_id: 'tblA' },
				{ name: state.table_name, table_id: 'tblB' },
			],
			has_more: false,
		},
	])
		assert.throws(() =>
			run('Finance Tables Plan', [response(data)], { 'Finance Table Request': first.json }),
		);
	assert.throws(() =>
		run('Finance Tables Plan', [{ code: 403 }], { 'Finance Table Request': state }),
	);
	assert.throws(() =>
		run('Finance Tables Plan', [response({ items: [{}], has_more: false })], {
			'Finance Table Request': state,
		}),
	);
});

test('Schema validation fetches all pages and fails before TikTok sync for missing/wrong key or currency', () => {
	const state = { base_id: TEST_BASE, table_id: 'tblNew', seen_cursors: [] };
	const [first] = run(
		'Validate Finance Schema',
		[response({ items: template.fields.slice(0, 20), has_more: true, page_token: 'p2' })],
		{ 'Finance Schema Request': state },
	);
	const [last] = run(
		'Validate Finance Schema',
		[response({ items: template.fields.slice(20), has_more: false })],
		{ 'Finance Schema Request': { ...first.json, seen_cursors: first.json.field_cursors } },
	);
	assert.equal(last.json.actual_fields.length, 49);
	for (const fields of [
		template.fields.slice(1),
		template.fields.map((f: { field_name: string }) =>
			f.field_name === key ? { ...f, type: 3 } : f,
		),
		template.fields.map((f: { type: number }) =>
			f.type === 2 ? { ...f, property: { currency_code: 'USD' } } : f,
		),
	])
		assert.throws(() =>
			run('Validate Finance Schema', [response({ items: fields, has_more: false })], {
				'Finance Schema Request': state,
			}),
		);
});

test('Statements paginate before filtering; every SETTLED statement in the preserved date window becomes an input', () => {
	const s1 = { id: '101', statement_time: 100, payment_status: 'SETTLED' };
	const s2 = { id: '102', statement_time: 101, payment_status: 'SETTLED' };
	const [page1] = run(
		'Validate Statements Page',
		[response({ statements: [s1], next_page_token: 'p2' })],
		{ '2. Argument Get Statment': { _state: {} } },
	);
	const [page2] = run(
		'Validate Statements Page',
		[response({ statements: [s2, { id: '103', statement_time: 101, payment_status: 'PENDING' }] })],
		{ '2. Argument Get Statment': { _state: page1.json } },
	);
	assert.deepEqual(
		run('Statement ID', [page2.json]).map(
			(i: { json: { statement_id: string } }) => i.json.statement_id,
		),
		['101', '102'],
	);
	assert.throws(() =>
		run('Validate Statements Page', [response({ statements: [s1] })], {
			'2. Argument Get Statment': { _state: page1.json },
		}),
	);
	assert.throws(() =>
		run('Validate Statements Page', [response({ statements: [], next_page_token: 'p2' })], {
			'2. Argument Get Statment': { _state: page1.json },
		}),
	);
	assert.throws(() =>
		run('Statement ID', [{ statements: [{ ...s1, statement_time: 'invalid' }] }]),
	);
});

test('Each TikTok page recalculates HMAC including its cursor and keeps IDs as strings', () => {
	const references = {
		'Get Token Tiktok': {
			app_id: 'fake-app',
			app_secret: 'fake-secret',
			access_token: 'fake-access',
			shop_id: 'shop1',
		},
	};
	for (const name of ['2. Argument Get Statment', 'Argument Get Transaction']) {
		const [first] = run(name, [{ statement_id: '123' }], references);
		const [second] = run(name, [{ statement_id: '123', next_page_token: 'page2' }], references);
		assert.notEqual(first.json.params.sign, second.json.params.sign);
		assert.equal(second.json.params.page_token, 'page2');
		assert(!JSON.stringify(second).includes('fake-secret'));
	}
});

test('Community HMAC request configuration matches the legacy TikTok signature with Code imports blocked', () => {
	const secret = 'fake-secret';
	const refs = {
		'Get Token Tiktok': {
			app_id: 'fake-app',
			app_secret: secret,
			access_token: 'fake-access',
			shop_id: 'shop1',
		},
	};
	const evaluate = (expression: string, json: object) =>
		new Script(`(${expression.slice(3, -2)})`).runInNewContext({
			$json: json,
			$: () => ({ first: () => ({ json: refs['Get Token Tiktok'] }) }),
		});
	for (const [argument, request] of [
		['1. Argument Get Shop', 'TikTok Get Shops HTTP'],
		['2. Argument Get Statment', '1. Get Statments'],
		['Argument Get Transaction', 'Get Transaction By Statement'],
	]) {
		const parameters = node(request).parameters;
		assert.equal(node(request).type, 'n8n-nodes-hmac.hmacRequest');
		assert.equal(parameters.includeTimestamp, false);
		assert.equal(parameters.signatureKey, 'sign');
		assert.equal(parameters.signaturePlacement, 'query');
		for (const next_page_token of ['', 'next+/=']) {
			const [prepared] = run(argument, [{ statement_id: '123', next_page_token }], refs);
			assert(!JSON.stringify(prepared).includes(secret));
			const payload = evaluate(parameters.customPattern, prepared.json);
			const actual = createHmac(parameters.algorithm, secret)
				.update(payload)
				.digest(parameters.encoding);
			const expected = new Script(
				`(function(){ ${template.signing}\nreturn generateTikTokSignSmart(${JSON.stringify({ appSecret: secret, path: prepared.json.path, params: prepared.json.params })}); })()`,
			).runInNewContext({ require: hostRequire });
			assert.equal(actual, expected);
			const query = evaluate(parameters.additionalFields.queryParams, prepared.json);
			assert.equal(query.sign, undefined);
			assert.equal(query.page_token, prepared.json.params.page_token);
			if (argument !== '1. Argument Get Shop')
				assert.equal(query.page_token, next_page_token || undefined);
			assert.equal(workflow.connections[argument].main[0][0].node, request);
		}
	}
	assert(!workflow.nodes.some((n: { type: string }) => n.type === 'n8n-nodes-base.crypto'));
	assert.deepEqual(useCommunityTikTokHmac(structuredClone(workflow)), workflow);
});

test('Restoring deleted TikTok auth preserves Lark settings and moves legacy AES to parameterized Supabase pgcrypto', () => {
	const original = source();
	const pg = original.nodes.find((n: { name: string }) => n.name === 'Get Encrypted Token Tiktok')!;
	Object.assign(pg, {
		type: 'n8n-nodes-base.postgres',
		typeVersion: 2.6,
		credentials: { postgres: { id: 'fake-pg', name: 'PG Test' } },
	});
	original.nodes.find((n: { name: string }) => n.name === 'Get Token Tiktok')!.parameters.jsCode =
		'const crypto = require("crypto"); const config = { appKey: "fake-key", appSecret: "fake-secret", encryptionKey: "00000000000000000000000000000000" };';
	const restored = structuredClone(workflow);
	const auth = new Set([
		'Get Encrypted Token Tiktok',
		'Get Token Tiktok',
		'Check access token',
		'1. If',
		'Get Encrypted Refresh Token Tiktok',
		'Get Refresh Token Tiktok',
		'Check Refresh Token',
		'3. If',
		'Agrument Refresh Token',
		'Refresh Token',
		'Encrypt Refreshed Token Tiktok',
		'Update Token Tiktok',
		'2. Stop and Error Refresh Token Tiktok',
		'Refresh Token Tiktok Expired',
	]);
	restored.nodes = restored.nodes.filter((n: { name: string }) => !auth.has(n.name));
	const lark = restored.nodes.find((n: { name: string }) => n.name === 'Lark Access Token');
	lark.credentials = { vutiendungLarkApi: { id: 'keep-lark', name: 'Existing Lark' } };
	restoreTikTokAuthentication(restored, original);
	assert.deepEqual(lark.credentials, {
		vutiendungLarkApi: { id: 'keep-lark', name: 'Existing Lark' },
	});
	assert.equal(
		restored.connections['Convert To Timestamp'].main[0][0].node,
		'Check TikTok pgcrypto',
	);
	assert.equal(restored.connections['1. If'].main[0][0].node, 'Lark Access Token');
	for (const name of [
		'Get Token Tiktok',
		'Get Refresh Token Tiktok',
		'Encrypt Refreshed Token Tiktok',
	]) {
		const n = restored.nodes.find((n: { name: string }) => n.name === name);
		assert.equal(n.type, 'n8n-nodes-base.postgres');
		assert.equal(n.credentials.postgres.id, 'fake-pg');
		assert(!n.parameters.query.includes('fake-secret'));
		assert(n.parameters.options.queryReplacement.includes('00000000000000000000000000000000'));
	}
	for (const value of ['bad-payload', 'v2:YQ==:YQ=='])
		assert.throws(() =>
			run('Validate TikTok access_token Payload', [{ access_token: value }], {}, restored),
		);
	const iv = Buffer.alloc(16).toString('base64');
	const ciphertext = Buffer.alloc(32).toString('base64');
	assert.equal(
		run(
			'Validate TikTok access_token Payload',
			[{ access_token: `v1:${iv}:${ciphertext}` }],
			{},
			restored,
		).length,
		1,
	);
	assert.equal(run('Validate TikTok access_token Payload', [{}], {}, restored).length, 1);
	assert.throws(() => run('Confirm TikTok pgcrypto', [{ available: false }], {}, restored));
	assert.equal(run('Confirm TikTok pgcrypto', [{ available: true }], {}, restored).length, 1);
	assert.throws(() => run('Validate TikTok Refresh Response', [{ code: 1 }], {}, restored));
	for (const n of restored.nodes)
		if (n.type === 'n8n-nodes-base.code') assert(!/require\s*\(/.test(n.parameters.jsCode), n.name);
});

test('Authorized shop list is selected by the database shop ID rather than its first item', () => {
	const shops = [
		{ id: 'other', cipher: 'other-cipher' },
		{ id: 'shop1', cipher: 'selected-cipher' },
	];
	const refs = { 'Get Token Tiktok': { shop_id: 'shop1' } };
	const [result] = run('1. Get Shop', [response({ shops })], refs);
	assert.deepEqual(result.json.data.shops, [shops[1]]);
	assert.throws(() => run('1. Get Shop', [response({ shops: [shops[0]] })], refs));
	assert.throws(() => run('1. Get Shop', [response({ shops: [shops[1], shops[1]] })], refs));
});

function transactions(transactions: object[], state = {}, extra = {}) {
	return run(
		'Format Finance',
		[response({ id: '123', create_time: 100, transactions, ...extra })],
		{
			'Argument Get Transaction': {
				_state: { statement_id: '123', statement_time: 100, ...state },
			},
		},
	);
}
test('Finance formatter preserves the 49-column mapping, long IDs, negative/zero money and exact timestamps', () => {
	const [page] = transactions([
		{
			id: '9876543210123456789',
			revenue_amount: '-12.5',
			settlement_amount: '0',
			order_create_time: 100,
		},
	]);
	const fields = page.json.records[0].fields;
	assert.equal(fields[key], '9876543210123456789_shop1');
	assert.equal(fields['Doanh thu (Gross)'], -12.5);
	assert.equal(fields['Thực thu (Net)'], 0);
	assert.equal(fields['Ngày tạo đơn'], 100000);
	assert.equal(fields['Ngày quyết toán'], 100000);
	assert(
		Object.keys(fields).every((name) =>
			template.fields.some((f: { field_name: string }) => f.field_name === name),
		),
	);
});
test('Empty transaction pages still carry pagination; duplicate/invalid IDs, bad money and wrong statements fail', () => {
	const [page] = transactions([], {}, { next_page_token: 'next' });
	assert.equal(page.json.has_more, true);
	assert.deepEqual(page.json.records, []);
	for (const values of [
		[{}],
		[{ id: 123 }],
		[{ id: 'a' }, { id: 'a' }],
		[{ id: 'a', revenue_amount: 'not-money' }],
	])
		assert.throws(() => transactions(values));
	assert.throws(() => transactions([{ id: 'a' }], { seen_keys: ['a_shop1'] }));
	assert.throws(() => transactions([], { seen_cursors: ['next'] }, { next_page_token: 'next' }));
	assert.throws(() => transactions([], {}, { id: 'other' }));
});
test('Batch results consolidate once per page and accumulate confirmed counts for a statement', () => {
	const page = {
		records: [{ fields: {} }, { fields: {} }],
		statement_id: '123',
		created: 2,
		updated: 3,
	};
	const [out] = run('Finance Page Result', [{ action: 'created' }, { action: 'updated' }], {
		'Format Finance': page,
	});
	assert.equal(out.json.created, 3);
	assert.equal(out.json.updated, 4);
	assert.throws(() =>
		run('Finance Page Result', [{ error: 'failed' }], { 'Format Finance': page }),
	);
	const [empty] = run('Finance Page Result', [{ records: [] }], {
		'Format Finance': { ...page, records: [] },
	});
	assert.equal(empty.json.created, 2);
});

test('Page control carries an empty page forward and resets per-statement counters without global data', () => {
	const initial = { statement_id: '123', statement_time: 100 };
	const [first] = transactions([{ id: 'a' }], initial, { next_page_token: 'p2' });
	const [firstResult] = run('Finance Page Result', [{ action: 'created' }], {
		'Format Finance': first.json,
	});
	const [empty] = transactions([], firstResult.json, { next_page_token: 'p3' });
	const [emptyResult] = run('Finance Page Result', [empty.json], { 'Format Finance': empty.json });
	assert.equal(emptyResult.json.has_more, true);
	assert.equal(emptyResult.json.next_page_token, 'p3');
	assert.equal(emptyResult.json.created, 1);
	const [last] = transactions([{ id: 'b' }], emptyResult.json);
	const [lastResult] = run('Finance Page Result', [{ action: 'updated' }], {
		'Format Finance': last.json,
	});
	assert.equal(lastResult.json.has_more, false);
	assert.equal(lastResult.json.created, 1);
	assert.equal(lastResult.json.updated, 1);
	const [other] = transactions([{ id: 'c' }], { statement_id: '123', statement_time: 100 });
	const [otherResult] = run('Finance Page Result', [{ action: 'created' }], {
		'Format Finance': other.json,
	});
	const [summary] = run('Finance Result', [lastResult.json, otherResult.json], {
		'Finance Target Ready': { base_id: TEST_BASE, table_id: 'tblFinance' },
	});
	assert.equal(summary.json.statements, 2);
	assert.equal(summary.json.created, 2);
	assert.equal(summary.json.updated, 1);
});

test('Converted finance records run through the real community Batch Upsert: create then replay updates, no extra creates', async () => {
	const records = transactions([
		{ id: 'a', revenue_amount: '5' },
		{ id: 'b', revenue_amount: '-3' },
	])[0].json.records;
	const stored = new Map<string, { record_id: string; fields: IDataObject }>();
	let creates = 0;
	const http = async (options: IHttpRequestOptions) => {
		let data: object;
		if (options.url.endsWith('/fields')) data = { items: template.fields, has_more: false };
		else if (options.url.endsWith('/search'))
			data = { items: [...stored.values()], has_more: false };
		else {
			const group = (
				options.body as { records: Array<{ fields: IDataObject; record_id?: string }> }
			).records;
			data = {
				records: group
					.map(({ fields, record_id }) => {
						if (!record_id) creates++;
						const record = { fields, record_id: record_id ?? `rec${creates}` };
						stored.set(String(fields[key]), record);
						return record;
					})
					.reverse(),
			};
		}
		return { statusCode: 200, headers: {}, body: { code: 0, data } };
	};
	const context = {
		getInputData: () => [{ json: {} }],
		getNode: () => ({ name: 'Batch Upsert Finance', typeVersion: 3 }),
		continueOnFail: () => false,
		getNodeParameter: (name: string, _index: number, fallback?: unknown) =>
			(
				({
					...node('Batch Upsert Finance').parameters,
					table: 'tblFinance',
					tenantAccessToken: 'fake-token',
					records,
				}) as Record<string, unknown>
			)[name] ?? fallback,
		helpers: { httpRequest: http },
	} as unknown as IExecuteFunctions;
	const [first] = await new LarkBase().execute.call(context);
	assert.deepEqual(
		first.map(({ json }) => json.action),
		['created', 'created'],
	);
	const [second] = await new LarkBase().execute.call(context);
	assert.deepEqual(
		second.map(({ json }) => json.action),
		['updated', 'updated'],
	);
	assert.equal(creates, 2);
	assert.deepEqual(
		second.map(({ json }) => json.unique_key),
		['a_shop1', 'b_shop1'],
	);
});
