import type { IDataObject } from 'n8n-workflow';
import { parseJsonValue, requireObject } from './normalizeFields';

const operators = new Set([
	'is',
	'isNot',
	'contains',
	'doesNotContain',
	'isEmpty',
	'isNotEmpty',
	'isGreater',
	'isGreaterEqual',
	'isLess',
	'isLessEqual',
	'like',
	'in',
]);

export function parseFilter(input: unknown): IDataObject | undefined {
	if (input === '' || input === undefined) return undefined;
	const filter = requireObject(parseJsonValue(input, 'Bộ lọc'), 'Bộ lọc');
	if (!Object.keys(filter).length) return undefined;
	return validateFilter(filter, false);
}

function validateFilter(filter: Record<string, unknown>, child: boolean): IDataObject {
	if (filter.conjunction !== 'and' && filter.conjunction !== 'or') {
		throw new Error('Bộ lọc cần conjunction là "and" hoặc "or".');
	}
	if (filter.conditions !== undefined && !Array.isArray(filter.conditions)) {
		throw new Error('conditions trong bộ lọc phải là mảng.');
	}
	const conditions = (filter.conditions as unknown[] | undefined)?.map((entry) => {
		const condition = requireObject(entry, 'Điều kiện lọc');
		if (
			typeof condition.field_name !== 'string' ||
			!condition.field_name ||
			typeof condition.operator !== 'string' ||
			!operators.has(condition.operator)
		) {
			throw new Error('Mỗi điều kiện cần field_name và operator hợp lệ của Lark Search.');
		}
		if (
			condition.value !== undefined &&
			(!Array.isArray(condition.value) ||
				!condition.value.every((value: unknown) => typeof value === 'string'))
		) {
			throw new Error('value trong điều kiện lọc phải là mảng chuỗi theo định dạng Lark.');
		}
		return {
			field_name: condition.field_name,
			operator: condition.operator,
			...(condition.value === undefined ? {} : { value: condition.value as string[] }),
		};
	});
	let children: IDataObject[] | undefined;
	if (filter.children !== undefined) {
		if (child || !Array.isArray(filter.children))
			throw new Error('Bộ lọc chỉ hỗ trợ một cấp nhóm children.');
		children = filter.children.map((entry: unknown) =>
			validateFilter(requireObject(entry, 'Nhóm lọc'), true),
		);
	}
	return {
		conjunction: filter.conjunction,
		...(conditions ? { conditions } : {}),
		...(children ? { children } : {}),
	};
}

export function parseSort(input: unknown): IDataObject[] | undefined {
	if (input === '' || input === undefined) return undefined;
	const sort = parseJsonValue(input, 'Sắp xếp');
	if (!Array.isArray(sort)) throw new Error('Sắp xếp phải là mảng đối tượng {field_name, desc}.');
	return sort.map((entry: unknown) => {
		const rule = requireObject(entry, 'Quy tắc sắp xếp');
		if (
			typeof rule.field_name !== 'string' ||
			!rule.field_name ||
			(rule.desc !== undefined && typeof rule.desc !== 'boolean')
		) {
			throw new Error('Mỗi quy tắc sắp xếp cần tên cột và desc dạng boolean nếu có.');
		}
		return { field_name: rule.field_name, desc: rule.desc ?? false };
	});
}
