import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import Module, { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { Script, createContext } from 'node:vm';

const require = createRequire(import.meta.url);
const targetWorkflow = require('n8n-workflow-runtime-2-4-1');
const luxon = require('luxon');
const localManifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const archive = resolve(
	process.argv[2] ??
		`${localManifest.name.replace(/^@/, '').replace('/', '-')}-${localManifest.version}.tgz`,
);
const tempBase = realpathSync(tmpdir());
const tempRoot = mkdtempSync(join(tempBase, 'lark-base-package-'));
const originalLoad = Module._load;

try {
	const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' })
		.trim()
		.split(/\r?\n/);
	assert(
		entries.every((entry) => entry.startsWith('package/') && !entry.split('/').includes('..')),
	);
	assert(!entries.some((entry) => /\/node_modules\/|\/tests\/|\/\.env/.test(entry)));
	execFileSync('tar', ['-xzf', archive, '-C', tempRoot]);
	const packageRoot = join(tempRoot, 'package');
	const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
	assert.equal(manifest.name, localManifest.name);
	assert.equal(manifest.version, localManifest.version);
	assert.deepEqual(manifest.dependencies, { luxon: '3.7.2' });
	assert.equal(manifest.peerDependenciesMeta?.['n8n-workflow']?.optional, true);
	assert.deepEqual(manifest.n8n.credentials, ['dist/credentials/VutiendungLarkApi.credentials.js']);
	assert(
		!entries.some((entry) => /\/credentials\/(?:LarkApi|LarkBaseApi)\.credentials\./.test(entry)),
	);
	// Giống n8n 2.4.1: bỏ dependency phát triển/peer trong bản cài, dùng runtime của host.
	const { devDependencies, peerDependencies, optionalDependencies, ...installedManifest } =
		manifest;
	void devDependencies;
	void peerDependencies;
	void optionalDependencies;
	writeFileSync(join(packageRoot, 'package.json'), JSON.stringify(installedManifest));
	const { NodeConnectionTypes: unused, ...legacyWorkflow } = targetWorkflow;
	void unused;
	// Mô phỏng module cũ đã require thành công nhưng constructor lỗi và còn nằm trong cache.
	const staleEntries = [
		['dist/nodes/LarkBase/LarkBase.node.js', 'LarkBase'],
		['dist/credentials/LarkApi.credentials.js', 'LarkApi'],
		['dist/credentials/LarkBaseApi.credentials.js', 'LarkBaseApi'],
	];
	for (const [sourcePath, className] of staleEntries) {
		assert(![...manifest.n8n.nodes, ...manifest.n8n.credentials].includes(sourcePath));
		const filename = join(packageRoot, sourcePath);
		mkdirSync(dirname(filename), { recursive: true });
		writeFileSync(
			filename,
			`exports.${className} = class { constructor() { throw new TypeError('module cũ trong cache'); } };`,
		);
		const oldExports = require(filename);
		assert.throws(() => new oldExports[className](), /module cũ trong cache/);
		writeFileSync(filename, `exports.${className} = class {};`);
		assert.throws(() => new (require(filename)[className])(), /module cũ trong cache/);
	}
	for (const [label, runtime] of [
		['n8n-workflow 2.4.1', targetWorkflow],
		['hợp đồng runtime dùng enum cũ', { ...legacyWorkflow, NodeConnectionType: { Main: 'main' } }],
		['đăng ký metadata không nạp runtime', null],
	]) {
		// Đổi runtime của toàn bộ cây module trong tiến trình kiểm thử, không sửa module của host.
		for (const key of Object.keys(require.cache))
			if (
				key.startsWith(packageRoot) &&
				!staleEntries.some(([entry]) => key === join(packageRoot, entry))
			)
				delete require.cache[key];
		Module._load = function (request, parent, isMain) {
			// Phụ thuộc đã khai báo được npm cài cạnh package trong môi trường thật.
			if (request === 'luxon') return luxon;
			if (request === 'n8n-workflow' && runtime === null) {
				throw new Error('Không được nạp runtime trong khi đăng ký metadata.');
			}
			return request === 'n8n-workflow'
				? runtime
				: originalLoad.call(this, request, parent, isMain);
		};
		for (const sourcePath of [...manifest.n8n.nodes, ...manifest.n8n.credentials]) {
			const filename = join(packageRoot, sourcePath).replace(/\\/g, '/');
			const className = basename(sourcePath).split('.')[0];
			const instance = new Script(
				`new (require(${JSON.stringify(filename)})[${JSON.stringify(className)}])()`,
			).runInContext(createContext({ require }));
			if (sourcePath.endsWith('.node.js')) {
				const expectedName = className === 'LarkAccessToken' ? 'larkAccessToken' : 'larkBase';
				const expectedLabel =
					className === 'LarkAccessToken'
						? 'Lark Access Token (Vutiendung)'
						: 'Lark Base (Vutiendung)';
				assert.equal(instance.description.name, expectedName);
				assert.equal(instance.description.displayName, expectedLabel);
				assert.deepEqual(instance.description.inputs, ['main']);
				assert.deepEqual(instance.description.outputs, ['main']);
				assert.deepEqual(
					instance.description.credentials.map(({ name }) => name),
					['vutiendungLarkApi'],
				);
			} else {
				assert.equal(instance.name, 'vutiendungLarkApi');
				assert.equal(instance.displayName, 'Lark API (Vutiendung)');
			}
			console.log(`Đạt: ${className} — ${label}`);
		}
	}
	for (const [sourcePath, className] of staleEntries) {
		assert.throws(
			() => new (require(join(packageRoot, sourcePath))[className])(),
			/module cũ trong cache/,
		);
	}
	console.log('Đạt: các entry mới nạp được dù các entry cũ vẫn lỗi trong cache.');
	console.log(`Đạt: ${manifest.name}@${manifest.version}, ${entries.length} tệp trong gói.`);
} finally {
	Module._load = originalLoad;
	// Chỉ xóa thư mục tạm vừa tạo sau khi kiểm tra đường dẫn tuyệt đối.
	const actual = realpathSync(tempRoot);
	assert.equal(dirname(actual), tempBase);
	assert(basename(actual).startsWith('lark-base-package-'));
	rmSync(actual, { recursive: true, force: true });
}
