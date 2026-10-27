import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { IDataObject, IExecuteFunctions, IHttpRequestOptions } from 'n8n-workflow';
import { LarkBase } from '../nodes/LarkBase/v1/LarkBase.node.ts';

const schema = [{ field_id: 'fldKey', field_name: 'Key', type: 1 }];
const page = (items: unknown[], extra: object = {}) => ({ items, has_more: false, ...extra });
const ok = (data: unknown) => ({ statusCode: 200, headers: {}, body: { code: 0, data } });
const forbidden = (msg = 'Permission denied') => ({
	statusCode: 403,
	headers: {},
	body: { code: 1254302, msg },
});

function harness(
	parameters: IDataObject[],
	{
		continueOnFail = false,
		credentials = () => ({
			appId: 'cliApp',
			appSecret: 'fake-secret',
			platform: 'lark',
		}),
		http = () => undefined,
	}: {
		continueOnFail?: boolean;
		credentials?: (index: number) => { appId: string; appSecret: string; platform: string };
		http?: (options: IHttpRequestOptions) => unknown | Promise<unknown>;
	} = {},
) {
	const calls: IHttpRequestOptions[] = [];
	const context = {
		getInputData: () => parameters.map(() => ({ json: {} })),
		getNode: () => ({
			name: 'Lark Base',
			type: '@vutiendung/n8n-nodes-lark-base.larkBase',
			typeVersion: 3,
			parameters: {},
			position: [0, 0],
			credentials: { vutiendungLarkApi: { id: 'credential1', name: 'App' } },
		}),
		getNodeParameter: (name: string, index: number, fallback?: unknown) => {
			const values: IDataObject = {
				resource: 'record',
				operation: 'upsert',
				authentication: 'appCredentials',
				platform: 'lark',
				base: 'ABC',
				table: 'tbl1',
				uniqueKeySource: 'manual',
				uniqueKeyFieldManual: 'Key',
				fields: { Key: `K${index}` },
				...parameters[index],
			};
			return Object.hasOwn(values, name) ? values[name] : fallback;
		},
		getCredentials: async (_type: string, index: number) => credentials(index),
		continueOnFail: () => continueOnFail,
		helpers: {
			httpRequest: async (options: IHttpRequestOptions) => {
				calls.push(options);
				const response = await http(options);
				if (response !== undefined) return response;
				if (options.url.endsWith('/tenant_access_token/internal'))
					return {
						statusCode: 200,
						headers: {},
						body: { code: 0, tenant_access_token: 'fake-app-token', expire: 7200 },
					};
				if (options.url.endsWith('/fields')) return ok(page(schema));
				if (options.url.endsWith('/search')) return ok(page([]));
				assert.equal(options.method, 'POST');
				const fields = (options.body as { fields: IDataObject }).fields;
				return ok({ record: { record_id: `rec${fields.Key}`, fields } });
			},
		},
	} as unknown as IExecuteFunctions;
	return {
		context,
		calls,
		run: () => new LarkBase().execute.call(context),
		count: (suffix: string) => calls.filter(({ url }) => url.endsWith(suffix)).length,
		writes: () =>
			calls.filter(
				({ method, url }) =>
					method !== 'GET' && /\/records(?:\/|$)/.test(url) && !url.endsWith('/search'),
			),
	};
}

for (const size of [100, 500]) {
	test(`${size} Upsert items reuse one tenant token and one fields schema per execution`, async () => {
		const { run, count } = harness(Array.from({ length: size }, () => ({})));
		const [output] = await run();
		assert.deepEqual(
			{
				token: count('/tenant_access_token/internal'),
				metadata: count('/fields'),
				lookup: count('/search'),
				write: count('/records'),
			},
			{ token: 1, metadata: 1, lookup: size, write: size },
		);
		assert.equal(output.length, size);
		for (let index = 0; index < size; index++) {
			assert.deepEqual(output[index].pairedItem, { item: index });
			assert.equal(output[index].json.unique_key, `K${index}`);
			assert.equal(output[index].json.action, 'created');
		}
	});
}

test('Supplied tokens A/B/A isolate authorization and schema; same token reuses schema', async () => {
	const metadataTokens: unknown[] = [];
	const lookupTokens: unknown[] = [];
	const writeTokens: unknown[] = [];
	const tokens = ['fake-token-A', 'fake-token-B', 'fake-token-A'];
	const { run, count } = harness(
		tokens.map((tenantAccessToken, index) => ({
			authentication: 'tenantToken',
			tenantAccessToken,
			fields: { Key: `0${index}` },
		})),
		{
			http: (options) => {
				const auth = options.headers?.Authorization;
				if (options.url.endsWith('/fields')) {
					metadataTokens.push(auth);
					return ok(page([{ ...schema[0], type: auth === 'Bearer fake-token-B' ? 2 : 1 }]));
				}
				if (options.url.endsWith('/search')) lookupTokens.push(auth);
				else if (options.url.endsWith('/records')) writeTokens.push(auth);
				return undefined;
			},
		},
	);
	// B sees a Number field, A sees Text. Reusing A's schema for B must fail this assertion.
	const [output] = await run();
	assert.equal(count('/tenant_access_token/internal'), 0);
	assert.equal(count('/fields'), 2);
	assert.deepEqual(metadataTokens, ['Bearer fake-token-A', 'Bearer fake-token-B']);
	assert.deepEqual(
		lookupTokens,
		tokens.map((token) => `Bearer ${token}`),
	);
	assert.deepEqual(writeTokens, lookupTokens);
	assert.equal(output.length, 3);
	assert.deepEqual(
		output.map(({ json }) => json.unique_key),
		['00', 1, '02'],
	);
});

test('Same supplied token on Lark/Feishu uses separate clients and metadata', async () => {
	const { run, calls, count } = harness(
		['lark', 'feishu', 'lark'].map((platform) => ({
			authentication: 'tenantToken',
			tenantAccessToken: 'fake-token',
			platform,
		})),
	);
	await run();
	assert.equal(count('/fields'), 2);
	for (const suffix of ['/fields', '/search', '/records']) {
		const origins = calls
			.filter(({ url }) => url.endsWith(suffix))
			.map(({ url }) => new URL(url).origin);
		assert.deepEqual(
			origins,
			suffix === '/fields'
				? ['https://open.larksuite.com', 'https://open.feishu.cn']
				: ['https://open.larksuite.com', 'https://open.feishu.cn', 'https://open.larksuite.com'],
		);
	}
});

for (const changed of ['appId', 'appSecret', 'platform'] as const) {
	test(`Credential ${changed} resolved per item isolates clients even with the same credential reference`, async () => {
		const tokenRequests: IHttpRequestOptions[] = [];
		const { run, calls, count } = harness([{}, {}, {}], {
			credentials: (index) => ({
				appId: changed === 'appId' && index === 1 ? 'cliOther' : 'cliApp',
				appSecret: changed === 'appSecret' && index === 1 ? 'fake-other-secret' : 'fake-secret',
				platform: changed === 'platform' && index === 1 ? 'feishu' : 'lark',
			}),
			http: (options) => {
				if (!options.url.endsWith('/tenant_access_token/internal')) return undefined;
				tokenRequests.push(options);
				return {
					statusCode: 200,
					headers: {},
					body: {
						code: 0,
						tenant_access_token: `fake-token-${tokenRequests.length}`,
						expire: 7200,
					},
				};
			},
		});
		await run();
		assert.equal(tokenRequests.length, 2);
		assert.equal(count('/fields'), 2);
		for (const suffix of ['/fields', '/search', '/records'])
			assert.deepEqual(
				calls
					.filter(({ url }) => url.endsWith(suffix))
					.map(({ headers }) => headers?.Authorization),
				suffix === '/fields'
					? ['Bearer fake-token-1', 'Bearer fake-token-2']
					: ['Bearer fake-token-1', 'Bearer fake-token-2', 'Bearer fake-token-1'],
			);
		assert.notDeepEqual(
			{ url: tokenRequests[0].url, body: tokenRequests[0].body },
			{ url: tokenRequests[1].url, body: tokenRequests[1].body },
		);
	});
}

test('App credentials and supplied token never share metadata, even when bearer values match', async () => {
	const { run, count } = harness([
		{},
		{ authentication: 'tenantToken', tenantAccessToken: 'fake-app-token' },
		{},
	]);
	await run();
	assert.equal(count('/tenant_access_token/internal'), 1);
	assert.equal(count('/fields'), 2);
});

test('Schema scope includes Base and Table; the same client shares only the token across tables', async () => {
	const { run, calls, count } = harness([
		{ base: 'ABC', table: 'tbl1' },
		{ base: 'DEF', table: 'tbl1' },
		{ base: 'ABC', table: 'tbl2' },
		{ base: 'ABC', table: 'tbl1' },
	]);
	await run();
	assert.equal(count('/tenant_access_token/internal'), 1);
	assert.deepEqual(
		calls.filter(({ url }) => url.endsWith('/fields')).map(({ url }) => new URL(url).pathname),
		[
			'/open-apis/bitable/v1/apps/ABC/tables/tbl1/fields',
			'/open-apis/bitable/v1/apps/DEF/tables/tbl1/fields',
			'/open-apis/bitable/v1/apps/ABC/tables/tbl2/fields',
		],
	);
});

test('Paginated fields load once in full, not once per item', async () => {
	const { run, count } = harness([{}, {}, {}], {
		http: (options) =>
			options.url.endsWith('/fields')
				? ok(
						options.qs?.page_token
							? page(schema)
							: page([{ field_id: 'fldOther', field_name: 'Other', type: 1 }], {
									has_more: true,
									page_token: 'next',
								}),
					)
				: undefined,
	});
	const [output] = await run();
	assert.equal(count('/fields'), 2); // Two pages for one schema, not six requests.
	assert.equal(count('/tenant_access_token/internal'), 1);
	assert.equal(output.length, 3);
});

test('Failed metadata promise is evicted; Continue On Fail retries the same loader for the next item', async () => {
	let attempts = 0;
	const { run, count } = harness([{}, {}, {}], {
		continueOnFail: true,
		http: (options) => {
			if (options.url.endsWith('/fields') && ++attempts === 1)
				return forbidden('fake-app-token fake-secret');
			return undefined;
		},
	});
	const [output] = await run();
	assert.equal(count('/tenant_access_token/internal'), 1);
	assert.equal(count('/fields'), 2);
	assert.equal(count('/search'), 2);
	assert.equal(count('/records'), 2);
	assert(output[0].json.error);
	assert.equal(output[0].json.action, undefined);
	assert.deepEqual(
		output.map(({ pairedItem }) => pairedItem),
		[{ item: 0 }, { item: 1 }, { item: 2 }],
	);
	assert(output.slice(1).every(({ json }) => json.action === 'created'));
	assert(!JSON.stringify(output).includes('fake-app-token'));
	assert(!JSON.stringify(output).includes('fake-secret'));
});

test('Metadata failure with Continue On Fail off prevents all lookup and writes', async () => {
	let attempts = 0;
	const { run, count, writes } = harness([{}, {}], {
		http: (options) =>
			options.url.endsWith('/fields') && ++attempts === 1 ? forbidden() : undefined,
	});
	await assert.rejects(run, /1254302/);
	assert.equal(count('/fields'), 2);
	assert.equal(count('/search'), 0);
	assert.equal(writes().length, 0);
});

test('Failed tenant acquisition does not poison the shared provider or metadata cache', async () => {
	let attempts = 0;
	const { run, count } = harness([{}, {}, {}], {
		continueOnFail: true,
		http: (options) =>
			options.url.endsWith('/tenant_access_token/internal') && ++attempts === 1
				? forbidden()
				: undefined,
	});
	const [output] = await run();
	assert(output[0].json.error);
	assert.equal(output[0].json.action, undefined);
	assert.equal(count('/tenant_access_token/internal'), 2);
	assert.equal(count('/fields'), 1);
	assert.equal(count('/records'), 2);
});

test('Auth refresh updates the shared provider for later logical items without reloading schema', async () => {
	let tokenRequests = 0;
	let searches = 0;
	const { run, calls, count } = harness([{}, {}], {
		http: (options) => {
			if (options.url.endsWith('/tenant_access_token/internal'))
				return {
					statusCode: 200,
					headers: {},
					body: {
						code: 0,
						tenant_access_token: `fake-token-${++tokenRequests}`,
						expire: 7200,
					},
				};
			if (options.url.endsWith('/search') && ++searches === 1)
				return { statusCode: 200, headers: {}, body: { code: 99991663, msg: 'expired' } };
			return undefined;
		},
	});
	await run();
	assert.equal(tokenRequests, 2);
	assert.equal(count('/fields'), 1);
	assert.deepEqual(
		calls.filter(({ url }) => url.endsWith('/search')).map(({ headers }) => headers?.Authorization),
		['Bearer fake-token-1', 'Bearer fake-token-2', 'Bearer fake-token-2'],
	);
});

test('Each execute starts fresh even when the node/context instance is reused', async () => {
	const { run, count } = harness([{}, {}]);
	await run();
	await run();
	assert.equal(count('/tenant_access_token/internal'), 2);
	assert.equal(count('/fields'), 2);
	assert.equal(count('/search'), 4);
	assert.equal(count('/records'), 4);
});

for (const continueOnFail of [false, true]) {
	test(`Raw duplicates still make zero HTTP calls with cache (Continue On Fail ${continueOnFail})`, async () => {
		const { run, calls } = harness([{ fields: { Key: 'A' } }, { fields: { Key: 'A' } }], {
			continueOnFail,
		});
		if (!continueOnFail) await assert.rejects(run, /trùng/);
		else {
			const [output] = await run();
			assert(output.every(({ json }) => json.error && json.action === undefined));
		}
		assert.equal(calls.length, 0);
	});

	test(`Canonical Number duplicates still stop before lookup/write with shared schema (Continue On Fail ${continueOnFail})`, async () => {
		const { run, count, writes } = harness([{ fields: { Key: '01' } }, { fields: { Key: 1 } }], {
			continueOnFail,
			http: (options) =>
				options.url.endsWith('/fields') ? ok(page([{ ...schema[0], type: 2 }])) : undefined,
		});
		if (!continueOnFail) await assert.rejects(run, /trùng/);
		else {
			const [output] = await run();
			assert(output.every(({ json }) => json.error && json.action === undefined));
			assert.deepEqual(
				output.map(({ pairedItem }) => pairedItem),
				[{ item: 0 }, { item: 1 }],
			);
		}
		assert.equal(count('/tenant_access_token/internal'), 1);
		assert.equal(count('/fields'), 1);
		assert.equal(count('/search'), 0);
		assert.equal(writes().length, 0);
	});
}

for (const continueOnFail of [false, true]) {
	test(`Credential platform changing after raw preflight fails closed before HTTP (Continue On Fail ${continueOnFail})`, async () => {
		let resolutions = 0;
		const { run, calls } = harness([{}], {
			continueOnFail,
			credentials: () => ({
				appId: 'cliApp',
				appSecret: 'fake-secret',
				platform: ++resolutions === 1 ? 'lark' : 'feishu',
			}),
		});
		if (!continueOnFail) await assert.rejects(run, /Nền tảng xác thực đã thay đổi/);
		else {
			const [output] = await run();
			assert.equal(output.length, 1);
			assert.match(String(output[0].json.error), /Nền tảng xác thực đã thay đổi/);
			assert.equal(output[0].json.action, undefined);
			assert.deepEqual(output[0].pairedItem, { item: 0 });
			assert(!JSON.stringify(output).includes('fake-secret'));
		}
		assert.equal(calls.length, 0);
	});
}

for (const failure of ['429', '403', '503', 'invalid', 'duplicate', 'cursor']) {
	test(`Shared cache never turns ${failure} lookup into NOT_FOUND or Create`, async () => {
		const { run, count, writes } = harness([{}, {}], {
			continueOnFail: true,
			http: (options) => {
				if (!options.url.endsWith('/search')) return undefined;
				if (failure === '403') return forbidden('fake-app-token fake-secret');
				if (failure === '429' || failure === '503')
					return {
						statusCode: Number(failure),
						headers: { 'Retry-After': '31' },
						body: { code: failure === '429' ? 1254290 : 999999, msg: 'unavailable' },
					}; // Exceeds the wait budget: fail immediately, no real sleeps in this test.
				if (failure === 'invalid') return ok({});
				if (failure === 'cursor') return ok(page([], { has_more: true }));
				const filter = (options.body as { filter: { conditions: Array<{ value: string[] }> } })
					.filter;
				const Key = filter.conditions[0].value[0];
				return ok(page(['recA', 'recB'].map((record_id) => ({ record_id, fields: { Key } }))));
			},
		});
		const [output] = await run();
		assert.equal(count('/fields'), 1);
		assert.equal(count('/tenant_access_token/internal'), 1);
		assert.equal(count('/search'), 2);
		assert.equal(writes().length, 0);
		assert.equal(output.length, 2);
		assert(output.every(({ json }) => json.error && json.action === undefined));
		assert.deepEqual(
			output.map(({ pairedItem }) => pairedItem),
			[{ item: 0 }, { item: 1 }],
		);
		assert(!JSON.stringify(output).includes('fake-app-token'));
		assert(!JSON.stringify(output).includes('fake-secret'));
	});
}

test('Shared cache keeps Batch Upsert update-before-create and restores reversed results to input order', async () => {
	const { run, calls, count } = harness(
		[0, 1].map((item) => ({
			operation: 'batchUpsert',
			records: ['NewA', 'OldA', 'NewB', 'OldB'].map((key) => ({
				fields: { Key: `${key}${item}` },
			})),
		})),
		{
			http: (options) => {
				if (options.url.endsWith('/search')) {
					const filter = (options.body as { filter: { conditions: Array<{ value: string[] }> } })
						.filter;
					return ok(
						page(
							filter.conditions
								.map(({ value }) => value[0])
								.filter((key) => key.startsWith('Old'))
								.map((Key) => ({ record_id: `rec${Key}`, fields: { Key } })),
						),
					);
				}
				if (options.url.endsWith('/batch_create') || options.url.endsWith('/batch_update')) {
					const { records } = options.body as {
						records: Array<{ fields: IDataObject; record_id?: string }>;
					};
					return ok({
						records: records
							.map(({ fields, record_id }) => ({
								record_id: record_id ?? `rec${fields.Key}`,
								fields,
							}))
							.reverse(),
					});
				}
				return undefined;
			},
		},
	);
	const [output] = await run();
	assert.equal(count('/tenant_access_token/internal'), 1);
	assert.equal(count('/fields'), 1);
	assert.deepEqual(
		calls.filter(({ url }) => /\/records\//.test(url)).map(({ url }) => url.split('/').at(-1)),
		['search', 'batch_update', 'batch_create', 'search', 'batch_update', 'batch_create'],
	);
	assert.deepEqual(
		output.map(({ json }) => json.action),
		['created', 'updated', 'created', 'updated', 'created', 'updated', 'created', 'updated'],
	);
	for (let index = 0; index < output.length; index++) {
		assert.deepEqual(output[index].pairedItem, { item: Math.floor(index / 4) });
		assert.equal(output[index].json.record_index, index % 4);
		assert.equal(
			output[index].json.unique_key,
			`${['NewA', 'OldA', 'NewB', 'OldB'][index % 4]}${Math.floor(index / 4)}`,
		);
	}
});

test('Batch Upsert with shared schema completes every lookup group before any write', async () => {
	let lookups = 0;
	const { run, count, writes } = harness(
		[0, 1].map((item) => ({
			operation: 'batchUpsert',
			records: Array.from({ length: 11 }, (_, index) => ({ fields: { Key: `K${item}-${index}` } })),
		})),
		{
			continueOnFail: true,
			http: (options) =>
				options.url.endsWith('/search') && ++lookups % 2 === 0 ? forbidden() : undefined,
		},
	);
	const [output] = await run();
	assert.equal(count('/tenant_access_token/internal'), 1);
	assert.equal(count('/fields'), 1);
	assert.equal(count('/search'), 4);
	assert.equal(writes().length, 0);
	assert.equal(output.length, 22);
	assert(output.every(({ json }) => json.error && json.action === undefined));
	for (let index = 0; index < output.length; index++) {
		assert.deepEqual(output[index].pairedItem, { item: Math.floor(index / 11) });
		assert.equal(output[index].json.record_index, index % 11);
	}
});

test('Invalid supplied token never borrows a cached valid client under Continue On Fail', async () => {
	const { run, count } = harness(
		['fake-token', '', 'Bearer fake-token', 'fake-token'].map((tenantAccessToken) => ({
			authentication: 'tenantToken',
			tenantAccessToken,
		})),
		{ continueOnFail: true },
	);
	const [output] = await run();
	assert.equal(count('/fields'), 1);
	assert.equal(count('/search'), 2);
	assert.equal(count('/records'), 2);
	assert.equal(output[0].json.action, 'created');
	assert.equal(output[3].json.action, 'created');
	for (const index of [1, 2]) {
		assert(output[index].json.error);
		assert.equal(output[index].json.action, undefined);
		assert.deepEqual(output[index].pairedItem, { item: index });
	}
});

for (const [label, first, second] of [
	['platform', { platform: 'lark' }, { platform: 'feishu' }],
	['Base', { base: 'ABC' }, { base: 'DEF' }],
	['Table', { table: 'tbl1' }, { table: 'tbl2' }],
	[
		'Unique Key Field',
		{ uniqueKeyFieldManual: 'Order ID' },
		{ uniqueKeyFieldManual: 'External ID' },
	],
] as const) {
	for (const canonical of [false, true]) {
		test(`Duplicate scope separates ${label}, including ${canonical ? 'canonical Number' : 'identical raw'} keys`, async () => {
			const parameters = [first, second].map((target, index) => ({
				authentication: 'tenantToken',
				tenantAccessToken: 'fake-token',
				fields: {
					['uniqueKeyFieldManual' in target ? (target.uniqueKeyFieldManual ?? 'Key') : 'Key']:
						canonical ? (index === 0 ? '01' : 1) : 'A001',
				},
				...target,
			}));
			const { run, calls, count } = harness(parameters, {
				http: (options) => {
					if (options.url.endsWith('/fields'))
						return ok(
							page(
								['Key', 'Order ID', 'External ID'].map((field_name) => ({
									field_id: `fld${field_name.replaceAll(' ', '')}`,
									field_name,
									type: canonical ? 2 : 1,
								})),
							),
						);
					if (options.url.endsWith('/records'))
						return ok({
							record: {
								record_id: 'recNew',
								fields: (options.body as { fields: IDataObject }).fields,
							},
						});
					return undefined;
				},
			});
			const [output] = await run();
			assert.equal(count('/search'), 2);
			assert.equal(count('/records'), 2);
			assert.deepEqual(
				output.map(({ json }) => json.unique_key),
				canonical ? [1, 1] : ['A001', 'A001'],
			);
			assert(output.every(({ json }) => json.action === 'created' && json.error === undefined));
			assert.deepEqual(
				output.map(({ pairedItem }) => pairedItem),
				[{ item: 0 }, { item: 1 }],
			);
			for (const suffix of ['/search', '/records'])
				assert.deepEqual(
					calls.filter(({ url }) => url.endsWith(suffix)).map(({ url }) => new URL(url).origin),
					[
						'https://open.larksuite.com',
						label === 'platform' ? 'https://open.feishu.cn' : 'https://open.larksuite.com',
					],
				);
		});
	}
}

for (const authentication of ['appCredentials', 'mixed'] as const) {
	test(`Duplicate scope uses effective platform from ${authentication}, not a hidden node platform parameter`, async () => {
		const { run, calls, count } = harness(
			[0, 1].map((index) => ({
				authentication:
					authentication === 'mixed' && index === 0 ? 'tenantToken' : 'appCredentials',
				tenantAccessToken: 'fake-token',
				platform: 'lark', // Hidden/irrelevant for the Feishu app credential.
				fields: { Key: 'A001' },
			})),
			{
				credentials: (index) => ({
					appId: 'cliApp',
					appSecret: 'fake-secret',
					platform: index === 0 ? 'lark' : 'feishu',
				}),
			},
		);
		const [output] = await run();
		assert(output.every(({ json }) => json.action === 'created'));
		assert.equal(count('/fields'), 2);
		for (const suffix of ['/fields', '/search', '/records'])
			assert.deepEqual(
				calls.filter(({ url }) => url.endsWith(suffix)).map(({ url }) => new URL(url).origin),
				['https://open.larksuite.com', 'https://open.feishu.cn'],
			);
	});
}

for (const continueOnFail of [false, true]) {
	for (const differentAuthorization of ['credential', 'token', 'mode'] as const) {
		test(`Same resource/raw key remains duplicate across ${differentAuthorization} contexts (Continue On Fail ${continueOnFail})`, async () => {
			const { run, calls } = harness(
				[0, 1].map((index) => ({
					authentication:
						differentAuthorization === 'token' || (differentAuthorization === 'mode' && index === 1)
							? 'tenantToken'
							: 'appCredentials',
					tenantAccessToken: `fake-token-${index}`,
					// A hidden platform difference must not split two Lark credential resources.
					platform: differentAuthorization === 'credential' && index === 1 ? 'feishu' : 'lark',
					fields: { Key: 'A001' },
				})),
				{
					continueOnFail,
					credentials: (index) => ({
						appId: `cliApp${index}`,
						appSecret: `fake-secret-${index}`,
						platform: 'lark',
					}),
				},
			);
			if (!continueOnFail) await assert.rejects(run, /trùng/);
			else {
				const [output] = await run();
				assert.equal(output.length, 2);
				assert(output.every(({ json }) => json.error && json.action === undefined));
				assert.deepEqual(
					output.map(({ pairedItem }) => pairedItem),
					[{ item: 0 }, { item: 1 }],
				);
				assert(!/fake-secret|fake-token|cliApp/.test(JSON.stringify(output)));
			}
			assert.equal(calls.length, 0); // Includes tenant token, metadata, lookup and write endpoints.
		});
	}

	test(`Same resource/canonical Number remains duplicate across credential contexts (Continue On Fail ${continueOnFail})`, async () => {
		const { run, count, writes } = harness(
			['01', 1].map((Key) => ({ fields: { Key } })),
			{
				continueOnFail,
				credentials: (index) => ({
					appId: `cliApp${index}`,
					appSecret: `fake-secret-${index}`,
					platform: 'lark',
				}),
				http: (options) =>
					options.url.endsWith('/fields') ? ok(page([{ ...schema[0], type: 2 }])) : undefined,
			},
		);
		if (!continueOnFail) await assert.rejects(run, /trùng/);
		else {
			const [output] = await run();
			assert(output.every(({ json }) => json.error && json.action === undefined));
			assert.deepEqual(
				output.map(({ pairedItem }) => pairedItem),
				[{ item: 0 }, { item: 1 }],
			);
			assert(!/fake-secret|fake-token|cliApp/.test(JSON.stringify(output)));
		}
		assert.equal(count('/tenant_access_token/internal'), 2);
		assert.equal(count('/fields'), 2); // Authorization caches stay isolated despite shared resource identity.
		assert.equal(count('/search'), 0);
		assert.equal(writes().length, 0);
	});
}
