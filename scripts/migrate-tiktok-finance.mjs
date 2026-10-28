import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const TEST_BASE = 'Df3WbKnmyaeUKJsphablcI8Jgeh';
const KEY = 'ID định danh (TTS)';

// These functions become n8n Code node bodies, not code executed by the converter.
function settings() {
	return [{ json: { sync_env: 'test', base_id: TEST_BASE } }];
}
function target() {
	const range = $('Month').first().json;
	const year = Number(range.current_year);
	const month = Number(range.current_month);
	if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12)
		throw new Error('Năm/tháng không hợp lệ.');
	return [
		{
			json: {
				base_id: TEST_BASE,
				table_name: `Finance_${year}_${String(month).padStart(2, '0')}`,
				expected_fields: EXPECTED_FIELDS,
			},
		},
	];
}
function tableRequest() {
	const state = $input.first().json;
	if (state.base_id !== TEST_BASE) throw new Error('Workflow chỉ được chạy trên Base test.');
	return [{ json: state }];
}
function tablesPlan() {
	const state = $('Finance Table Request').item.json;
	const data = responseData($input.first().json, 'liệt kê bảng');
	const accumulated = [...(state.tables ?? []), ...readPage(data)];
	for (const table of accumulated)
		if (
			!table ||
			typeof table.name !== 'string' ||
			typeof table.table_id !== 'string' ||
			!/^tbl[a-zA-Z0-9]+$/.test(table.table_id)
		)
			throw new Error('Danh sách bảng không hợp lệ; không suy diễn là chưa có bảng.');
	const cursor = nextCursor(data, state.seen_cursors ?? []);
	const matches = accumulated.filter((table) => table.name === state.table_name);
	if (matches.length > 1)
		throw new Error('Có nhiều bảng trùng tên Finance; dừng để tránh chọn nhầm.');
	const table_id = matches[0]?.table_id;
	if (table_id !== undefined && !/^tbl[a-zA-Z0-9]+$/.test(table_id))
		throw new Error('Table ID không hợp lệ.');
	return [
		{ json: { ...state, tables: accumulated, ...cursor, table_id, table_exists: !!table_id } },
	];
}
function createdTable() {
	const data = responseData($input.first().json, 'tạo bảng');
	if (typeof data.table_id !== 'string' || !/^tbl[a-zA-Z0-9]+$/.test(data.table_id))
		throw new Error('Lark chưa xác nhận Table ID.');
	return [{ json: { ...$('Get Table Finance').first().json, table_id: data.table_id } }];
}
function schemaRequest() {
	const state = $input.first().json;
	if (state.base_id !== TEST_BASE || !/^tbl[a-zA-Z0-9]+$/.test(state.table_id))
		throw new Error('Sai target Base/Table.');
	return [
		{
			json: {
				...state,
				page_token: state.fields_cursor ?? '',
				seen_cursors: state.field_cursors ?? [],
			},
		},
	];
}
function schemaPlan() {
	const state = $('Finance Schema Request').item.json;
	const data = responseData($input.first().json, 'đọc schema');
	const fields = [...(state.actual_fields ?? []), ...readPage(data)];
	const cursor = nextCursor(data, state.seen_cursors);
	if (!cursor.has_more) {
		const names = new Map();
		for (const field of fields) {
			if (names.has(field.field_name)) throw new Error('Schema trả tên cột lặp.');
			names.set(field.field_name, field);
		}
		for (const expected of EXPECTED_FIELDS) {
			const actual = names.get(expected.field_name);
			if (
				!actual ||
				actual.type !== expected.type ||
				(expected.type === 1 && ['Formula', 'Lookup', 'AutoNumber'].includes(actual.ui_type))
			)
				throw new Error(`Thiếu hoặc sai kiểu cột: ${expected.field_name}. Không ghi dữ liệu.`);
			if (
				expected.ui_type === 'Currency' &&
				(actual.ui_type !== 'Currency' || actual.property?.currency_code !== 'VND')
			)
				throw new Error(`Cột tiền phải là Currency/VND: ${expected.field_name}.`);
		}
	}
	return [
		{
			json: {
				...state,
				actual_fields: fields,
				fields_cursor: cursor.page_token,
				field_cursors: cursor.seen_cursors,
				has_more: cursor.has_more,
			},
		},
	];
}
function ready() {
	const { base_id, table_id, table_name } = $input.first().json;
	return [{ json: { base_id, table_id, table_name } }];
}
function selectShop() {
	const data = responseData($input.first().json, 'TikTok shops');
	const requested = $('Get Token Tiktok').first().json.shop_id;
	if (!Array.isArray(data.shops) || !requested) throw new Error('Thiếu shop/token TikTok.');
	const matches = data.shops.filter(
		(shop) => typeof shop.id === 'string' && shop.id === String(requested),
	);
	if (matches.length !== 1 || typeof matches[0].cipher !== 'string' || !matches[0].cipher)
		throw new Error('Không tìm thấy đúng một shop khớp token trong database.');
	return [{ json: { code: 0, data: { ...data, shops: matches } } }];
}
function statementsPlan() {
	const state = $('2. Argument Get Statment').item.json._state;
	const data = responseData($input.first().json, 'TikTok statements');
	if (!Array.isArray(data.statements)) throw new Error('TikTok thiếu mảng statements.');
	const statements = [...(state.statements ?? []), ...data.statements];
	const ids = new Set();
	for (const statement of statements) {
		if (typeof statement.id !== 'string' || !statement.id || ids.has(statement.id))
			throw new Error('Statement ID thiếu/lặp; dừng phân trang.');
		ids.add(statement.id);
	}
	const cursor = nextTikTokCursor(data, state.seen_cursors ?? []);
	return [{ json: { statements, ...cursor } }];
}
function statementItems() {
	const range = $('Month').first().json;
	for (const statement of $input.first().json.statements)
		if (
			typeof statement.payment_status !== 'string' ||
			(statement.payment_status === 'SETTLED' &&
				!Number.isSafeInteger(Number(statement.statement_time)))
		)
			throw new Error('Statement thiếu trạng thái/thời gian hợp lệ; không bỏ qua dữ liệu lỗi.');
	return $input
		.first()
		.json.statements.filter(
			(s) =>
				s.payment_status === 'SETTLED' &&
				Number(s.statement_time) >= Number(range.statement_time_ge) - 1 &&
				Number(s.statement_time) < Number(range.statement_time_lt) - 1,
		)
		.map((s) => ({ json: { statement_id: s.id, statement_time: s.statement_time } }));
}
function formatPage() {
	const state = $('Argument Get Transaction').item.json._state;
	const data = responseData($input.first().json, 'TikTok transactions');
	if (!Array.isArray(data.transactions)) throw new Error('TikTok thiếu mảng transactions.');
	if (data.id !== undefined && data.id !== state.statement_id)
		throw new Error('TikTok trả sai Statement ID.');
	const shop = $('1. Get Shop').first().json.data.shops[0];
	if (typeof shop.id !== 'string' || !shop.id) throw new Error('Shop ID phải là chuỗi.');
	const keys = new Set(state.seen_keys ?? []);
	const records = data.transactions.map((tx) => {
		if (typeof tx.id !== 'string' || !tx.id.trim())
			throw new Error('Transaction ID phải là chuỗi không rỗng.');
		const record = mapFieldsToLark(
			formatTikTokTransactionFull(
				tx,
				shop.id,
				shop.name,
				state.statement_id,
				data.create_time ?? state.statement_time,
			),
			TRANSACTION_FIELD_MAP,
			TRANSACTION_TYPE_MAP,
		);
		const key = record.fields[KEY];
		if (keys.has(key))
			throw new Error('Transaction key bị lặp trong statement; không tự chọn dòng thắng.');
		keys.add(key);
		return record;
	});
	const cursor = nextTikTokCursor(data, state.seen_cursors ?? []);
	return [{ json: { ...state, ...cursor, seen_keys: [...keys], records } }];
}
function afterWrite() {
	const page = $('Format Finance').item.json;
	const written = $input.all().map((i) => i.json);
	if (
		page.records.length &&
		(written.length !== page.records.length ||
			written.some((r) => r.error || !['created', 'updated'].includes(r.action)))
	)
		throw new Error('Chưa xác nhận đủ kết quả Batch Upsert.');
	return [
		{
			json: {
				...page,
				records: undefined,
				created:
					(page.created ?? 0) +
					(page.records.length ? written.filter((r) => r.action === 'created').length : 0),
				updated:
					(page.updated ?? 0) +
					(page.records.length ? written.filter((r) => r.action === 'updated').length : 0),
			},
		},
	];
}
function finalSummary() {
	const items = $input.all().map((i) => i.json);
	return [
		{
			json: {
				...$('Finance Target Ready').first().json,
				statements: items.length,
				created: items.reduce((n, i) => n + (i.created ?? 0), 0),
				updated: items.reduce((n, i) => n + (i.updated ?? 0), 0),
			},
		},
	];
}

function responseData(body, label) {
	if (!body || body.code !== 0 || !body.data || typeof body.data !== 'object')
		throw new Error(`Phản hồi ${label} không thành công/hợp lệ; không ghi dữ liệu.`);
	return body.data;
}
function readPage(data) {
	if (data.items === undefined && data.has_more === false && data.total === 0) return [];
	if (!Array.isArray(data.items) || typeof data.has_more !== 'boolean')
		throw new Error('Lark trả trang không hợp lệ.');
	return data.items;
}
function nextCursor(data, seen) {
	const token = data.page_token;
	if (
		data.has_more &&
		(typeof token !== 'string' || !token || seen.includes(token) || seen.length >= 1000)
	)
		throw new Error('Cursor Lark thiếu/lặp hoặc quá giới hạn.');
	return {
		has_more: data.has_more,
		page_token: data.has_more ? token : '',
		seen_cursors: data.has_more ? [...seen, token] : seen,
	};
}
function nextTikTokCursor(data, seen) {
	const token = data.next_page_token;
	if (token !== undefined && token !== null && typeof token !== 'string')
		throw new Error('TikTok cursor sai kiểu.');
	if (
		(data.has_more === true && !token) ||
		(token && (seen.includes(token) || seen.length >= 1000))
	)
		throw new Error('Cursor TikTok thiếu/lặp hoặc quá giới hạn.');
	return {
		has_more: !!token,
		next_page_token: token ?? '',
		seen_cursors: token ? [...seen, token] : seen,
	};
}
function financeNumber(value) {
	if (
		!['number', 'string'].includes(typeof value) ||
		(typeof value === 'string' && !value.trim()) ||
		!Number.isFinite(Number(value))
	)
		throw new Error('Giá trị tiền không hợp lệ; không thay thành 0/null.');
	return Number(value);
}

const body = (fn) =>
	fn.toString().slice(fn.toString().indexOf('{') + 1, fn.toString().lastIndexOf('}'));
const common = [responseData, readPage, nextCursor, nextTikTokCursor, financeNumber]
	.map(String)
	.join('\n');

// Prepare only the unsigned message here. The permitted built-in Crypto node wraps it
// with the secret and computes HMAC; Code nodes never import crypto or emit the secret.
function unsignedTikTokPayload({
	appSecret,
	path,
	params = {},
	body = null,
	contentType = 'application/json',
	method = 'GET',
}) {
	if (!appSecret || !path) throw new Error('Thiếu cấu hình ký request TikTok.');
	const keys = Object.keys(params)
		.filter(
			(key) =>
				!['sign', 'access_token'].includes(key) &&
				params[key] !== '' &&
				params[key] !== null &&
				params[key] !== undefined,
		)
		.sort();
	let message = path + keys.map((key) => `${key}${params[key]}`).join('');
	if (method !== 'GET' && contentType !== 'multipart/form-data' && body !== null)
		message += JSON.stringify(body);
	return message;
}

function prepareTikTokArgument(argument) {
	const code = argument.parameters.jsCode;
	const tail = code.search(/^const\s+(?:appKey|input|settings)\s*=/m);
	if (tail < 0 || !code.includes('function generateTikTokSignSmart'))
		throw new Error('Kh?ng nh?n d?ng ???c ph?n chu?n b? request TikTok.');
	const prepared =
		unsignedTikTokPayload.toString().replace('unsignedTikTokPayload', 'generateTikTokSignSmart') +
		'\n' +
		code.slice(tail);
	if (/require\s*\(/.test(prepared)) throw new Error('Node k? TikTok c?n import module.');
	argument.parameters.jsCode = '// n8n-tiktok-unsigned-payload-v2\n' + prepared;
}

export function useCommunityTikTokHmac(workflow) {
	const pairs = [
		['1. Argument Get Shop', 'Shop', 'TikTok Get Shops HTTP'],
		['2. Argument Get Statment', 'Statements', '1. Get Statments'],
		['Argument Get Transaction', 'Transactions', 'Get Transaction By Statement'],
	];
	for (const [argumentName, suffix, requestName] of pairs) {
		const argument = workflow.nodes.find((node) => node.name === argumentName);
		if (!argument) throw new Error('Thi?u node chu?n b? TikTok.');
		prepareTikTokArgument(argument);
		const request = workflow.nodes.find((node) => node.name === requestName);
		if (request?.type === 'n8n-nodes-hmac.hmacRequest') continue;
		if (!request || request.type !== 'n8n-nodes-base.httpRequest')
			throw new Error(`Không nhận dạng HTTP node TikTok: ${requestName}`);
		request.type = 'n8n-nodes-hmac.hmacRequest';
		request.typeVersion = 1;
		request.retryOnFail = false;
		request.parameters = {
			method: 'GET',
			url: '=https://open-api.tiktokglobalshop.com{{ $json.path }}',
			algorithm: 'sha256',
			encoding: 'hex',
			signaturePattern: 'custom',
			customPattern:
				"={{ $('Get Token Tiktok').first().json.app_secret + $json.params.sign + $('Get Token Tiktok').first().json.app_secret }}",
			signaturePlacement: 'query',
			signatureKey: 'sign',
			includeTimestamp: false,
			additionalFields: {
				headers: '={{ $json.headers }}',
				queryParams:
					'={{ Object.fromEntries(Object.entries($json.params).filter(([key]) => key !== "sign")) }}',
				timeout: 30000,
			},
		};
		request.notes =
			'Chọn HMAC API credential có API Key bằng TikTok App Secret. Custom Pattern giữ định dạng ký TikTok; timestamp đã được tạo ở node Argument, không bật Include Timestamp.';
		workflow.connections[argumentName].main[0] = [{ node: requestName, type: 'main', index: 0 }];
		for (const name of [`TikTok HMAC ${suffix}`, `Apply TikTok Signature ${suffix}`]) {
			delete workflow.connections[name];
			workflow.nodes = workflow.nodes.filter((node) => node.name !== name);
		}
	}
	return workflow;
}

export function restoreTikTokAuthentication(workflow, source) {
	const names = [
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
	];
	for (const [index, name] of names.entries()) {
		if (workflow.nodes.some((node) => node.name === name)) continue;
		const original = source.nodes.find((node) => node.name === name);
		if (!original) throw new Error(`Không có node xác thực TikTok trong nguồn: ${name}`);
		const node = structuredClone(original);
		node.position = [(index % 7) * 280, -640 + Math.floor(index / 7) * 250];
		workflow.nodes.push(node);
	}
	const connect = (from, yes, no) => {
		workflow.connections[from] = {
			main: [
				[{ node: yes, type: 'main', index: 0 }],
				...(no ? [[{ node: no, type: 'main', index: 0 }]] : []),
			],
		};
	};
	connect('Convert To Timestamp', 'Get Encrypted Token Tiktok');
	connect('Get Encrypted Token Tiktok', 'Get Token Tiktok');
	connect('Get Token Tiktok', 'Check access token');
	connect('Check access token', '1. If');
	connect('1. If', 'Lark Access Token', 'Get Encrypted Refresh Token Tiktok');
	connect('Get Encrypted Refresh Token Tiktok', 'Get Refresh Token Tiktok');
	connect('Get Refresh Token Tiktok', 'Check Refresh Token');
	connect('Check Refresh Token', '3. If');
	connect('3. If', 'Agrument Refresh Token', 'Refresh Token Tiktok Expired');
	connect('Agrument Refresh Token', 'Refresh Token');
	connect('Refresh Token', 'Encrypt Refreshed Token Tiktok');
	connect('Encrypt Refreshed Token Tiktok', 'Update Token Tiktok');
	connect('Update Token Tiktok', '2. Stop and Error Refresh Token Tiktok');
	for (const name of [
		'Get Encrypted Token Tiktok',
		'Get Encrypted Refresh Token Tiktok',
		'Update Token Tiktok',
	])
		workflow.nodes.find((node) => node.name === name).alwaysOutputData = true;
	return usePostgresTokenCrypto(workflow, source);
}

// Supabase pgcrypto handles the existing v1:iv:cipher AES-CBC format. No Code node
// imports crypto and no database extension/schema is installed by this tool.
export function usePostgresTokenCrypto(workflow, source) {
	const access = source.nodes.find((node) => node.name === 'Get Token Tiktok');
	if (!/require\(['"]crypto['"]\)/.test(access?.parameters.jsCode ?? '')) return workflow;
	const extract = (code, name) => {
		const match = code.match(new RegExp(`\\b${name}:\\s*("(?:[^"\\\\]|\\\\.)*")`));
		if (!match) throw new Error(`Không đọc được cấu hình ${name}; không tự thay key.`);
		return JSON.parse(match[1]);
	};
	const appKey = extract(access.parameters.jsCode, 'appKey');
	const appSecret = extract(access.parameters.jsCode, 'appSecret');
	const key = extract(access.parameters.jsCode, 'encryptionKey');
	const decoded = key.startsWith('hex:')
		? Buffer.from(key.slice(4), 'hex')
		: key.startsWith('base64:')
			? Buffer.from(key.slice(7), 'base64')
			: Buffer.from(key, 'utf8');
	if (decoded.length !== 32) throw new Error('Key AES nguồn phải có đúng 32 byte.');
	const pg = source.nodes.find((node) => node.name === 'Get Encrypted Token Tiktok');
	if (pg?.type !== 'n8n-nodes-base.postgres')
		throw new Error('Cần Postgres credential của workflow nguồn.');
	const checkName = 'Check TikTok pgcrypto';
	const confirmName = 'Confirm TikTok pgcrypto';
	if (!workflow.nodes.some((node) => node.name === checkName))
		workflow.nodes.push({
			id: 'finance-check-pgcrypto',
			name: checkName,
			type: pg.type,
			typeVersion: pg.typeVersion,
			credentials: structuredClone(pg.credentials),
			position: [0, -1000],
			parameters: {
				operation: 'executeQuery',
				query:
					"SELECT count(DISTINCT p.proname) = 3 AND coalesce(bool_and(has_function_privilege(p.oid,'EXECUTE')),false) AS available FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='extensions' AND p.proname IN ('encrypt_iv','decrypt_iv','gen_random_bytes');",
				options: {},
			},
		});
	if (!workflow.nodes.some((node) => node.name === confirmName))
		workflow.nodes.push({
			id: 'finance-confirm-pgcrypto',
			name: confirmName,
			type: 'n8n-nodes-base.code',
			typeVersion: 2,
			position: [280, -1000],
			parameters: {
				jsCode:
					"if ($input.first().json.available !== true) throw new Error('Cần bật pgcrypto tại schema extensions của Supabase và quyền EXECUTE trước khi giải mã token TikTok.'); return $input.all();",
			},
		});
	workflow.connections['Convert To Timestamp'] = {
		main: [[{ node: checkName, type: 'main', index: 0 }]],
	};
	workflow.connections[checkName] = { main: [[{ node: confirmName, type: 'main', index: 0 }]] };
	workflow.connections[confirmName] = {
		main: [[{ node: 'Get Encrypted Token Tiktok', type: 'main', index: 0 }]],
	};
	const keySql =
		"CASE WHEN left($2::text,4)='hex:' THEN decode(substr($2::text,5),'hex') WHEN left($2::text,7)='base64:' THEN decode(substr($2::text,8),'base64') ELSE convert_to($2::text,'UTF8') END";
	for (const [name, field, previous] of [
		['Get Token Tiktok', 'access_token', 'Get Encrypted Token Tiktok'],
		['Get Refresh Token Tiktok', 'refresh_token', 'Get Encrypted Refresh Token Tiktok'],
	]) {
		const node = workflow.nodes.find((node) => node.name === name);
		if (!node) continue;
		node.type = 'n8n-nodes-base.postgres';
		node.typeVersion = pg.typeVersion;
		node.credentials = structuredClone(pg.credentials);
		node.parameters = {
			operation: 'executeQuery',
			query: `SELECT $3::text AS app_id, $4::text AS app_secret, $5::text AS shop_id, CASE WHEN nullif($1::text,'') IS NULL THEN NULL ELSE convert_from(extensions.decrypt_iv(decode(split_part($1::text,':',3),'base64'), ${keySql}, decode(split_part($1::text,':',2),'base64'), 'aes-cbc/pad:pkcs'),'UTF8') END AS ${field};`,
			options: {
				queryReplacement: `={{ [$json.${field} ?? null, ${JSON.stringify(key)}, ${JSON.stringify(appKey)}, ${JSON.stringify(appSecret)}, $json.shop_id ?? null] }}`,
			},
		};
		const validatorName = `Validate TikTok ${field} Payload`;
		if (!workflow.nodes.some((n) => n.name === validatorName))
			workflow.nodes.push({
				id: `finance-validate-${field}`,
				name: validatorName,
				type: 'n8n-nodes-base.code',
				typeVersion: 2,
				position: [node.position[0] - 100, node.position[1] + 100],
				parameters: {
					jsCode: `const row = $input.first().json; const value = row.${field}; const bytes = s => s.length % 4 ? -1 : s.length / 4 * 3 - (s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0); if (value != null && value !== '') { const parts = typeof value === 'string' ? value.split(':') : []; if (parts.length !== 3 || parts[0] !== 'v1' || !/^[A-Za-z0-9+/]+={0,2}$/.test(parts[1]) || !/^[A-Za-z0-9+/]+={0,2}$/.test(parts[2]) || bytes(parts[1]) !== 16 || bytes(parts[2]) <= 0 || bytes(parts[2]) % 16) throw new Error('Token TikTok mã hóa sai định dạng.'); } return [{ json: row }];`,
				},
			});
		workflow.connections[previous] = { main: [[{ node: validatorName, type: 'main', index: 0 }]] };
		workflow.connections[validatorName] = { main: [[{ node: name, type: 'main', index: 0 }]] };
	}
	const encrypt = workflow.nodes.find((node) => node.name === 'Encrypt Refreshed Token Tiktok');
	if (encrypt) {
		encrypt.type = 'n8n-nodes-base.postgres';
		encrypt.typeVersion = pg.typeVersion;
		encrypt.credentials = structuredClone(pg.credentials);
		encrypt.parameters = {
			operation: 'executeQuery',
			query: `WITH k AS (SELECT ${keySql} AS key), iv AS (SELECT extensions.gen_random_bytes(16) AS a, extensions.gen_random_bytes(16) AS r) SELECT ($1::jsonb)->'data' AS data, 'v1:' || encode(iv.a,'base64') || ':' || replace(encode(extensions.encrypt_iv(convert_to(($1::jsonb)->'data'->>'access_token','UTF8'),k.key,iv.a,'aes-cbc/pad:pkcs'),'base64'),chr(10),'') AS encrypted_access_token, 'v1:' || encode(iv.r,'base64') || ':' || replace(encode(extensions.encrypt_iv(convert_to(($1::jsonb)->'data'->>'refresh_token','UTF8'),k.key,iv.r,'aes-cbc/pad:pkcs'),'base64'),chr(10),'') AS encrypted_refresh_token FROM k CROSS JOIN iv;`,
			options: { queryReplacement: `={{ [JSON.stringify($json), ${JSON.stringify(key)}] }}` },
		};
		const name = 'Validate TikTok Refresh Response';
		if (!workflow.nodes.some((n) => n.name === name))
			workflow.nodes.push({
				id: 'finance-validate-refresh-response',
				name,
				type: 'n8n-nodes-base.code',
				typeVersion: 2,
				position: [encrypt.position[0] - 100, encrypt.position[1] + 100],
				parameters: {
					jsCode:
						"const value = $input.first().json; if (value.code !== 0 || !value.data || typeof value.data.access_token !== 'string' || !value.data.access_token || typeof value.data.refresh_token !== 'string' || !value.data.refresh_token || !Number.isSafeInteger(Number(value.data.access_token_expire_in)) || !Number.isSafeInteger(Number(value.data.refresh_token_expire_in))) throw new Error('TikTok refresh không trả token/thời hạn hợp lệ.'); return [{ json: value }];",
				},
			});
		workflow.connections['Refresh Token'] = { main: [[{ node: name, type: 'main', index: 0 }]] };
		workflow.connections[name] = { main: [[{ node: encrypt.name, type: 'main', index: 0 }]] };
	}
	return workflow;
}

export function convertFinanceWorkflow(source) {
	const original = (name) => {
		const node = source.nodes.find((n) => n.name === name);
		if (!node) throw new Error(`Thiếu node nguồn: ${name}`);
		return structuredClone(node);
	};
	const schemaCode = original('Schema finance - Validate and Plan').parameters.jsCode;
	const match = schemaCode.match(/const expectedFields = (\[[\s\S]*?\n\]);/);
	if (!match) throw new Error('Không đọc được schema gốc.');
	const fields = JSON.parse(match[1]);
	if (fields[0]?.field_name !== KEY || fields[0]?.type !== 1)
		throw new Error('Cột khóa gốc phải là Text.');
	const prefix = `const TEST_BASE = ${JSON.stringify(TEST_BASE)};\nconst KEY = ${JSON.stringify(KEY)};\nconst EXPECTED_FIELDS = ${JSON.stringify(fields)};\n${common}\n`;
	const nodes = [];
	const code = (name, fn, extra = '') =>
		add(name, 'n8n-nodes-base.code', 2, { jsCode: prefix + extra + '\n' + body(fn) });
	function add(name, type, typeVersion, parameters = {}) {
		const node = {
			id: `finance-${nodes.length}`,
			name,
			type,
			typeVersion,
			parameters,
			position: [nodes.length * 220, 300],
		};
		nodes.push(node);
		return node;
	}
	const kept = [
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
	];
	for (const name of kept) nodes.push(original(name));
	const get = (name) => nodes.find((n) => n.name === name);
	const month = get('Month');
	if (!month.parameters.jsCode.includes('current_month: month,'))
		throw new Error('Không nhận dạng được node Month gốc.');
	month.parameters.jsCode = month.parameters.jsCode.replace(
		'current_month: month,',
		'current_month: month,\n    current_year: year,',
	);
	get('Get Encrypted Token Tiktok').alwaysOutputData = true;
	get('Get Encrypted Refresh Token Tiktok').alwaysOutputData = true;
	get('1. Get Shop').name = 'TikTok Get Shops HTTP';
	get('Encrypt Refreshed Token Tiktok').parameters.jsCode = get(
		'Encrypt Refreshed Token Tiktok',
	).parameters.jsCode.replace(
		'`TikTok refresh failed: ${JSON.stringify(response)}`',
		'"TikTok refresh failed; kiểm tra phản hồi mà không chia sẻ token."',
	);
	add('Chạy thử thủ công', 'n8n-nodes-base.manualTrigger', 1);
	const schedule = original('Schedule Trigger');
	schedule.disabled = true;
	nodes.push(schedule);
	const token = add('Lark Access Token', '@vutiendung/n8n-nodes-lark-base.larkAccessToken', 2);
	token.notes =
		'Chọn credential Lark API (Vutiendung) có quyền quản lý Base test. App Secret nằm trong credential.';
	code('Workflow Settings', settings);
	code('Get Table Finance', target);
	code('Finance Table Request', tableRequest);
	code('Finance Tables Plan', tablesPlan);
	code('Finance Table Created', createdTable);
	code('Finance Schema Request', schemaRequest);
	code('Validate Finance Schema', schemaPlan);
	code('Finance Target Ready', ready);
	code('1. Get Shop', selectShop);
	const headers = {
		parameters: [
			{
				name: 'Authorization',
				value: "=Bearer {{ $('Lark Access Token').first().json.tenant_access_token }}",
			},
			{ name: 'Content-Type', value: 'application/json; charset=utf-8' },
		],
	};
	const baseUrl = `https://open.larksuite.com/open-apis/bitable/v1/apps/${TEST_BASE}`;
	const query =
		'={{ JSON.stringify({ page_size: 100, ...($json.page_token ? { page_token: $json.page_token } : {}) }) }}';
	const http = (name, url, extra = {}) =>
		add(name, 'n8n-nodes-base.httpRequest', 4.2, {
			url,
			sendHeaders: true,
			headerParameters: headers,
			options: { timeout: 30000 },
			...extra,
		});
	http('Lark List Tables', `${baseUrl}/tables`, {
		sendQuery: true,
		specifyQuery: 'json',
		jsonQuery: query,
	});
	http('Lark Create Finance Table', `${baseUrl}/tables`, {
		method: 'POST',
		sendBody: true,
		specifyBody: 'json',
		jsonBody:
			"={{ JSON.stringify({ table: { name: $json.table_name, default_view_name: 'Finance', fields: $('Get Table Finance').first().json.expected_fields } }) }}",
	});
	http('Lark List Finance Fields', `=${baseUrl}/tables/{{ $json.table_id }}/fields`, {
		sendQuery: true,
		specifyQuery: 'json',
		jsonQuery: query,
	});
	function branch(name, expression) {
		return add(name, 'n8n-nodes-base.if', 2.2, {
			conditions: {
				options: { caseSensitive: true, typeValidation: 'strict', version: 2 },
				conditions: [
					{
						id: name,
						leftValue: expression,
						rightValue: true,
						operator: { type: 'boolean', operation: 'true', singleValue: true },
					},
				],
				combinator: 'and',
			},
			options: {},
		});
	}
	branch('More Lark Tables', '={{ $json.has_more }}');
	branch('Finance Table Exists', '={{ $json.table_exists }}');
	branch('More Finance Fields', '={{ $json.has_more }}');
	const signPrefix = original('2. Argument Get Statment').parameters.jsCode.split(
		'const appKey =',
	)[0];
	if (!signPrefix.includes('function generateTikTokSignSmart'))
		throw new Error('Thiếu hàm ký TikTok gốc.');
	get('1. Argument Get Shop').parameters.jsCode =
		`${signPrefix}\nconst settings = $('Get Token Tiktok').first().json;\nconst path = '/authorization/202309/shops';\nconst params = { app_key: settings.app_id, timestamp: Math.floor(Date.now() / 1000) };\nparams.sign = generateTikTokSignSmart({ appSecret: settings.app_secret, path, params, method: 'GET' });\nreturn [{ json: { path, params, headers: { 'x-tts-access-token': settings.access_token } } }];`;
	const signing = (transaction) =>
		`${signPrefix}\nconst input = $input.first().json;\nconst settings = $('Get Token Tiktok').first().json;\nconst shop = $('1. Get Shop').first().json;\nif (shop.code !== 0 || !Array.isArray(shop.data?.shops) || shop.data.shops.length !== 1) throw new Error('Cần đúng một shop được xác thực.');\nconst currentShop = shop.data.shops[0];\nif (String(currentShop.id) !== String(settings.shop_id)) throw new Error('Shop trả về không khớp token trong database.');\nconst _state = ${transaction ? '{ ...input, statement_id: input.statement_id }' : '{ statements: input.statements ?? [], seen_cursors: input.seen_cursors ?? [] }'};\n${transaction ? "if (typeof _state.statement_id !== 'string' || !/^[0-9]+$/.test(_state.statement_id)) throw new Error('Statement ID không hợp lệ.');" : ''}\nconst path = ${transaction ? '`/finance/202501/statements/${_state.statement_id}/statement_transactions`' : '"/finance/202309/statements"'};\nconst params = { app_key: settings.app_id, timestamp: Math.floor(Date.now() / 1000), page_size: 100, sort_order: 'DESC', sort_field: '${transaction ? 'order_create_time' : 'statement_time'}', shop_cipher: currentShop.cipher };\n${transaction ? '' : "params.statement_time_ge = $('Convert To Timestamp').first().json.from; params.statement_time_lt = $('Convert To Timestamp').first().json.to;"}\nif (input.next_page_token) params.page_token = input.next_page_token;\nparams.sign = generateTikTokSignSmart({ appSecret: settings.app_secret, path, params, method: 'GET' });\nreturn [{ json: { path, params, headers: { 'x-tts-access-token': settings.access_token }, _state } }];`;
	add('2. Argument Get Statment', 'n8n-nodes-base.code', 2, { jsCode: signing(false) });
	add('Argument Get Transaction', 'n8n-nodes-base.code', 2, { jsCode: signing(true) });
	code('Validate Statements Page', statementsPlan);
	branch('More Statements Pages', '={{ $json.has_more }}');
	code('Statement ID', statementItems);
	add('Loop Over Statements', 'n8n-nodes-base.splitInBatches', 3, { batchSize: 1, options: {} });
	const originalFormat = original('Format Finance').parameters.jsCode;
	if (!originalFormat.includes('const shop_id ='))
		throw new Error('Không nhận dạng được formatter gốc.');
	const formatter = originalFormat
		.split('const shop_id =')[0]
		.replace(
			/Number\(trx\.(shipping_cost_amount|adjustment_amount)\) \|\| 0/g,
			'Number(trx.$1 || 0)',
		)
		.replace(/\bNumber\(/g, 'financeNumber(');
	code('Format Finance', formatPage, formatter);
	branch('Finance Has Records', '={{ $json.records.length > 0 }}');
	const upsert = add('Batch Upsert Finance', '@vutiendung/n8n-nodes-lark-base.larkBase', 3, {
		authentication: 'tenantToken',
		tenantAccessToken: "={{ $('Lark Access Token').first().json.tenant_access_token }}",
		platform: 'lark',
		resource: 'record',
		operation: 'batchUpsert',
		base: TEST_BASE,
		table: {
			__rl: true,
			mode: 'id',
			value: "={{ $('Finance Target Ready').first().json.table_id }}",
		},
		uniqueKeySource: 'manual',
		uniqueKeyFieldManual: KEY,
		records: '={{ $json.records }}',
		batchSize: 500,
	});
	upsert.retryOnFail = false;
	upsert.notes =
		'Batch Upsert theo ID giao dịch + Shop. Lỗi lookup/duplicate dừng; không bật Continue On Fail/Retry On Fail.';
	code('Finance Page Result', afterWrite);
	branch('More Transaction Pages', '={{ $json.has_more }}');
	code('Finance Result', finalSummary);
	const connections = {};
	const wire = (from, to, output = 0) => {
		connections[from] ??= { main: [] };
		connections[from].main[output] ??= [];
		connections[from].main[output].push({ node: to, type: 'main', index: 0 });
	};
	const chain = (...names) => names.slice(1).forEach((name, i) => wire(names[i], name));
	chain(
		'Chạy thử thủ công',
		'Month',
		'Convert To Timestamp',
		'Get Encrypted Token Tiktok',
		'Get Token Tiktok',
		'Check access token',
		'1. If',
	);
	wire('Schedule Trigger', 'Month');
	wire('1. If', 'Lark Access Token');
	wire('1. If', 'Get Encrypted Refresh Token Tiktok', 1);
	chain(
		'Get Encrypted Refresh Token Tiktok',
		'Get Refresh Token Tiktok',
		'Check Refresh Token',
		'3. If',
	);
	chain(
		'3. If',
		'Agrument Refresh Token',
		'Refresh Token',
		'Encrypt Refreshed Token Tiktok',
		'Update Token Tiktok',
		'2. Stop and Error Refresh Token Tiktok',
	);
	wire('3. If', 'Refresh Token Tiktok Expired', 1);
	chain(
		'Lark Access Token',
		'Workflow Settings',
		'Get Table Finance',
		'Finance Table Request',
		'Lark List Tables',
		'Finance Tables Plan',
		'More Lark Tables',
	);
	wire('More Lark Tables', 'Finance Table Request');
	wire('More Lark Tables', 'Finance Table Exists', 1);
	wire('Finance Table Exists', 'Finance Schema Request');
	wire('Finance Table Exists', 'Lark Create Finance Table', 1);
	chain('Lark Create Finance Table', 'Finance Table Created', 'Finance Schema Request');
	chain(
		'Finance Schema Request',
		'Lark List Finance Fields',
		'Validate Finance Schema',
		'More Finance Fields',
	);
	wire('More Finance Fields', 'Finance Schema Request');
	wire('More Finance Fields', 'Finance Target Ready', 1);
	chain(
		'Finance Target Ready',
		'1. Argument Get Shop',
		'TikTok Get Shops HTTP',
		'1. Get Shop',
		'2. Argument Get Statment',
		'1. Get Statments',
		'Validate Statements Page',
		'More Statements Pages',
	);
	wire('More Statements Pages', '2. Argument Get Statment');
	wire('More Statements Pages', 'Statement ID', 1);
	chain('Statement ID', 'Loop Over Statements');
	wire('Loop Over Statements', 'Finance Result');
	wire('Loop Over Statements', 'Argument Get Transaction', 1);
	chain(
		'Argument Get Transaction',
		'Get Transaction By Statement',
		'Format Finance',
		'Finance Has Records',
		'Batch Upsert Finance',
		'Finance Page Result',
		'More Transaction Pages',
	);
	wire('Finance Has Records', 'Finance Page Result', 1);
	wire('More Transaction Pages', 'Argument Get Transaction');
	wire('More Transaction Pages', 'Loop Over Statements', 1);
	const rows = [
		[
			'Chạy thử thủ công',
			'Month',
			'Convert To Timestamp',
			'Get Encrypted Token Tiktok',
			'Get Token Tiktok',
			'Check access token',
			'1. If',
			'Lark Access Token',
		],
		[
			'Workflow Settings',
			'Get Table Finance',
			'Finance Table Request',
			'Lark List Tables',
			'Finance Tables Plan',
			'More Lark Tables',
			'Finance Table Exists',
			'Lark Create Finance Table',
			'Finance Table Created',
		],
		[
			'Finance Schema Request',
			'Lark List Finance Fields',
			'Validate Finance Schema',
			'More Finance Fields',
			'Finance Target Ready',
		],
		[
			'1. Argument Get Shop',
			'TikTok Get Shops HTTP',
			'1. Get Shop',
			'2. Argument Get Statment',
			'1. Get Statments',
			'Validate Statements Page',
			'More Statements Pages',
			'Statement ID',
		],
		[
			'Loop Over Statements',
			'Argument Get Transaction',
			'Get Transaction By Statement',
			'Format Finance',
			'Finance Has Records',
			'Batch Upsert Finance',
			'Finance Page Result',
			'More Transaction Pages',
			'Finance Result',
		],
		[
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
		],
	];
	rows.forEach((names, row) =>
		names.forEach((name, column) => {
			get(name).position = [column * 280, row * 320];
		}),
	);
	get('Schedule Trigger').position = [0, -220];
	nodes.forEach((n) => {
		delete n.webhookId;
	});
	return usePostgresTokenCrypto(
		useCommunityTikTokHmac({
			name: 'TikTok Finance → Lark Community — TEST',
			nodes,
			connections,
			active: false,
			pinData: {},
			settings: { executionOrder: 'v1', timezone: 'Asia/Ho_Chi_Minh' },
		}),
		source,
	);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	const input = process.argv[2];
	if (input === '--fix-signing' || input === '--community-hmac') {
		const file = resolve(process.argv[3] ?? '.n8n/tiktok-finance-community-test.workflow.json');
		const original = readFileSync(file, 'utf8');
		let patched = JSON.parse(original);
		if (process.argv[4])
			patched = restoreTikTokAuthentication(
				patched,
				JSON.parse(readFileSync(process.argv[4], 'utf8')),
			);
		patched = useCommunityTikTokHmac(patched);
		const backup = `${file}.before-community-hmac.bak`;
		if (!existsSync(backup)) copyFileSync(file, backup);
		writeFileSync(file, JSON.stringify(patched, null, 2) + '\n');
		console.log(
			'Đã chuyển 3 request sang n8n-nodes-hmac; giữ cấu hình hiện tại và backup trong .n8n. Chưa gọi API.',
		);
	} else {
		if (!input)
			throw new Error('Usage: node scripts/migrate-tiktok-finance.mjs <source.json> [output.json]');
		const output = resolve(process.argv[3] ?? '.n8n/tiktok-finance-community-test.workflow.json');
		const workflow = convertFinanceWorkflow(JSON.parse(readFileSync(input, 'utf8')));
		mkdirSync(dirname(output), { recursive: true });
		writeFileSync(output, JSON.stringify(workflow, null, 2) + '\n');
		console.log(
			`Đã tạo workflow local: ${output} (${workflow.nodes.length} nodes). Chưa gọi API hoặc tạo bảng trên Lark.`,
		);
	}
}
