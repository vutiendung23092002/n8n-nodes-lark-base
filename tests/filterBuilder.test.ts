import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { INodeParameters, INodeProperties } from 'n8n-workflow';
import type { LarkField } from '../shared/types';
import {
	buildStructuredFilter,
	datePresets,
	filterOperators,
} from '../nodes/LarkBase/helpers/filterBuilder';
import { LarkBase } from '../nodes/LarkBase/v1/LarkBase.node.ts';
import { getWorkflowRuntime } from '../shared/runtime';

const fields: LarkField[] = [
	{ field_id: 'fldShop', field_name: 'Shop', type: 1 },
	{ field_id: 'fldTotal', field_name: 'Tổng', type: 2 },
	{ field_id: 'fldTags', field_name: 'Nhãn', type: 4 },
	{ field_id: 'fldDate', field_name: 'Ngày', type: 5 },
	{ field_id: 'fldCreated', field_name: 'Tạo lúc', type: 1001 },
	{ field_id: 'fldUpdated', field_name: 'Sửa lúc', type: 1002 },
];
const build = (condition: unknown[], conjunction = 'and') =>
	buildStructuredFilter({ condition }, conjunction, async () => fields);

for (const { value: operator } of filterOperators) {
	test(`Bộ lọc tạo đúng payload cho ${operator}`, async () => {
		const empty = ['isEmpty', 'isNotEmpty'].includes(operator);
		const result = await build([
			{
				fieldName: 'Tổng',
				operator,
				valueMode: 'single',
				singleValue: 123,
			},
		]);
		assert.deepEqual(result, {
			conjunction: 'and',
			conditions: [{ field_name: 'Tổng', operator, value: empty ? [] : ['123'] }],
		});
	});
}

test('Nhiều giá trị tách dòng CRLF, giữ dấu phẩy/khoảng trắng và bỏ dòng trắng', async () => {
	assert.deepEqual(
		await build(
			[
				{
					fieldName: 'Nhãn',
					operator: 'contains',
					valueMode: 'multiple',
					multipleValues: 'Shop A, miền Bắc\r\nShop B\r\n\r\n  Shop C  ',
				},
			],
			'or',
		),
		{
			conjunction: 'or',
			conditions: [
				{
					field_name: 'Nhãn',
					operator: 'contains',
					value: ['Shop A, miền Bắc', 'Shop B', '  Shop C  '],
				},
			],
		},
	);
});

test('Giá trị từ expression giữ 0/false và nhận mảng nhiều giá trị', async () => {
	const result = await build([
		{ fieldName: 'Tổng', operator: 'is', singleValue: 0 },
		{ fieldName: 'Shop', operator: 'is', singleValue: false },
		{
			fieldName: 'Nhãn',
			operator: 'contains',
			valueMode: 'multiple',
			multipleValues: ['A', 0, false],
		},
	]);
	assert.deepEqual(
		(result!.conditions as Array<{ value: string[] }>).map(({ value }) => value),
		[['0'], ['false'], ['A', '0', 'false']],
	);
});

for (const { value: datePreset } of datePresets.filter(({ value }) => value !== 'ExactDate')) {
	test(`Ngày tương đối ${datePreset} không gửi timestamp hoặc giá trị cũ`, async () => {
		const result = await build([
			{
				fieldName: 'Ngày',
				operator: 'is',
				valueMode: 'date',
				datePreset,
				dateValue: 'sai',
				singleValue: 'giá trị cũ',
			},
		]);
		assert.deepEqual(result!.conditions, [
			{ field_name: 'Ngày', operator: 'is', value: [datePreset] },
		]);
	});
}

test('Ngày cụ thể, ngày tạo và ngày sửa dùng ExactDate/timestamp mili giây', async () => {
	const result = await build(
		['Ngày', 'Tạo lúc', 'Sửa lúc'].map((fieldName) => ({
			fieldName,
			operator: 'isGreater',
			valueMode: 'date',
			datePreset: 'ExactDate',
			dateValue: '2026-10-24T07:00:00+07:00',
		})),
	);
	assert.deepEqual(
		(result!.conditions as Array<{ value: string[] }>).map(({ value }) => value),
		Array.from({ length: 3 }, () => ['ExactDate', String(Date.parse('2026-10-24T00:00:00Z'))]),
	);
});

test('Không có điều kiện thì không tải metadata hoặc gửi filter rỗng', async () => {
	assert.equal(
		await buildStructuredFilter({}, 'and', async () => {
			throw new Error('Không được tải metadata');
		}),
		undefined,
	);
});

test('Chế độ nhập tên cột bỏ qua lựa chọn cũ và giữ tên chính xác', async () => {
	const result = await build([
		{
			fieldSource: 'manual',
			fieldNameManual: 'Shop',
			fieldName: 'không tồn tại',
			operator: 'is',
			singleValue: 'Shop A',
		},
	]);
	assert.equal((result!.conditions as Array<{ field_name: string }>)[0].field_name, 'Shop');
});

test('Điều kiện lỗi được báo theo vị trí, không âm thầm bỏ lọc', async () => {
	for (const condition of [
		{ fieldName: 'Cột đã bị xóa', operator: 'is', singleValue: 'A' },
		{ fieldName: 'Shop', operator: 'like', singleValue: 'A' },
		{ fieldName: 'Shop', operator: 'in', singleValue: 'A' },
		{ fieldName: 'Shop', operator: 'is', singleValue: '' },
		{ fieldName: 'Shop', operator: 'is', singleValue: {} },
		{ fieldName: 'Shop', operator: 'is', valueMode: 'multiple', multipleValues: '\n\n' },
		{ fieldName: 'Shop', operator: 'is', valueMode: 'multiple', multipleValues: [''] },
		{ fieldName: 'Ngày', operator: 'isNot', valueMode: 'date', datePreset: 'Today' },
		{ fieldName: 'Ngày', operator: 'isGreaterEqual', valueMode: 'date', datePreset: 'Today' },
		{ fieldName: 'Ngày', operator: 'is', valueMode: 'single', singleValue: '2026-10-24' },
		{ fieldName: 'Ngày', operator: 'is', valueMode: 'date', dateValue: '2026-02-30' },
		{ fieldName: 'Ngày', operator: 'is', valueMode: 'date', datePreset: 'không hợp lệ' },
	]) {
		await assert.rejects(
			build([{ fieldName: 'Shop', operator: 'is', singleValue: 'A' }, condition]),
			/Điều kiện lọc 2:/,
		);
	}
	await assert.rejects(build([], 'xor'), /AND.*OR/);
	await assert.rejects(
		buildStructuredFilter({ condition: {} }, 'and', async () => fields),
		/mảng/,
	);
});

test('Rỗng/không rỗng bỏ giá trị cũ và không bắt chọn kiểu Ngày', async () => {
	assert.deepEqual(
		(await build([
			{
				fieldName: 'Ngày',
				operator: 'isEmpty',
				valueMode: 'single',
				singleValue: 'cũ',
			},
		]))!.conditions,
		[{ field_name: 'Ngày', operator: 'isEmpty', value: [] }],
	);
});

test('Node mới dùng bộ lọc trực quan, version 1/2 giữ JSON và xác thực theo version', () => {
	const { NodeHelpers } = getWorkflowRuntime();
	const { description } = new LarkBase();
	assert.equal(description.defaultVersion, 3);
	for (const typeVersion of [1, 2, 3]) {
		const parameters = NodeHelpers.getNodeParameters(
			description.properties,
			{ operation: 'search' },
			true,
			false,
			{ typeVersion },
			description,
		)!;
		assert.equal(parameters.filterMode, typeVersion === 3 ? 'builder' : undefined);
		assert.equal(parameters.authentication, typeVersion === 1 ? undefined : 'tenantToken');
		const jsonProperty = description.properties.find(({ name }) => name === 'filter')!;
		assert.equal(
			NodeHelpers.displayParameter(parameters, jsonProperty, { typeVersion }, description),
			typeVersion !== 3,
		);
		assert.equal(
			NodeHelpers.displayParameter(
				parameters,
				description.credentials![0],
				{ typeVersion },
				description,
			),
			typeVersion === 1,
		);
	}
	const conditions = description.properties.find(({ name }) => name === 'filterConditions')!;
	const values = (conditions.options![0] as { values: INodeProperties[] }).values;
	for (const operator of ['isEmpty', 'isNotEmpty']) {
		for (const name of ['singleValue', 'multipleValues', 'datePreset', 'dateValue']) {
			assert.equal(
				NodeHelpers.displayParameter(
					{ operator, valueMode: 'single' },
					values.find((property) => property.name === name)!,
					{ typeVersion: 3 },
					description,
				),
				false,
			);
		}
	}
});

test('Workflow mẫu giữ các điều kiện sau khi n8n áp dụng defaults/displayOptions', async () => {
	const example = JSON.parse(readFileSync('examples/search-records.workflow.json', 'utf8')) as {
		nodes: Array<{ type: string; typeVersion: number; parameters: Record<string, unknown> }>;
	};
	const node = example.nodes.find(({ type }) => type.endsWith('.larkBase'))!;
	const description = new LarkBase().description;
	const { NodeHelpers } = getWorkflowRuntime();
	const parameters = NodeHelpers.getNodeParameters(
		description.properties,
		node.parameters as INodeParameters,
		true,
		false,
		{ typeVersion: node.typeVersion },
		description,
	)!;
	assert.equal(node.typeVersion, 3);
	assert.equal(parameters.filterMode, 'builder');
	const result = await buildStructuredFilter(
		parameters.filterConditions,
		parameters.filterConjunction,
		async () => fields,
	);
	assert.deepEqual(result, {
		conjunction: 'and',
		conditions: [
			{ field_name: 'Shop', operator: 'is', value: ['Shop A'] },
			{ field_name: 'Nhãn', operator: 'contains', value: ['Khách mới', 'Đã liên hệ'] },
		],
	});
});
