import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { createContext, Script } from 'node:vm';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';
import * as currentWorkflow from 'n8n-workflow';
import * as targetWorkflow from 'n8n-workflow-runtime-2-4-1';

const { NodeConnectionTypes: _unused, ...withoutNewConnectionTypes } = targetWorkflow;
void _unused;
const runtimes = [
	['runtime phát triển', currentWorkflow],
	['n8n-workflow 2.4.1', targetWorkflow],
	[
		'hợp đồng runtime dùng enum cũ',
		{
			...withoutNewConnectionTypes,
			NodeConnectionType: { Main: 'main' },
		},
	],
] as const;

function loadSourceClass(sourcePath: string, runtime: object): Record<string, unknown> {
	const filename = resolve(sourcePath);
	const nativeRequire = createRequire(filename);
	const module = { exports: {} as Record<string, new () => Record<string, unknown>> };
	const context = createContext({
		module,
		exports: module.exports,
		require: (request: string) => (request === 'n8n-workflow' ? runtime : nativeRequire(request)),
		__filename: filename,
		__dirname: dirname(filename),
	});
	const { outputText } = transpileModule(readFileSync(filename, 'utf8'), {
		compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
	});
	new Script(outputText, { filename }).runInContext(context);
	// n8n lấy tên class từ phần đầu tên file, không lấy export đầu tiên của module.
	const className = basename(sourcePath).split('.')[0];
	return new Script(`new (module.exports[${JSON.stringify(className)}])()`).runInContext(
		context,
	) as Record<string, unknown>;
}

for (const [label, runtime] of runtimes) {
	test(`Loader nạp đúng class node với ${label}`, () => {
		const node = loadSourceClass('nodes/LarkBase/v1/LarkBase.node.ts', runtime);
		const description = node.description as { name: string; inputs: string[]; outputs: string[] };
		assert.equal(description.name, 'larkBase');
		assert.equal(description.inputs[0], 'main');
		assert.equal(description.outputs[0], 'main');
	});
	test(`Loader nạp đúng class credential với ${label}`, () => {
		assert.equal(
			loadSourceClass('credentials/VutiendungLarkApi.credentials.ts', runtime).name,
			'vutiendungLarkApi',
		);
	});
}
