import type { IDataObject } from 'n8n-workflow';
import type { LarkField } from '../../../shared/types';
import { requireObject } from './normalizeFields';
import { normalizeFilterDate } from './filterDate';

export const filterOperators = [
	{ name: 'Là (bằng)', value: 'is' },
	{ name: 'Không bằng', value: 'isNot' },
	{ name: 'Chứa', value: 'contains' },
	{ name: 'Không chứa', value: 'doesNotContain' },
	{ name: 'Rỗng', value: 'isEmpty' },
	{ name: 'Không rỗng', value: 'isNotEmpty' },
	{ name: 'Lớn hơn', value: 'isGreater' },
	{ name: 'Lớn hơn hoặc bằng', value: 'isGreaterEqual' },
	{ name: 'Nhỏ hơn', value: 'isLess' },
	{ name: 'Nhỏ hơn hoặc bằng', value: 'isLessEqual' },
];

export const datePresets = [
	{ name: 'Ngày cụ thể', value: 'ExactDate' },
	{ name: 'Hôm nay', value: 'Today' },
	{ name: 'Hôm qua', value: 'Yesterday' },
	{ name: 'Ngày mai', value: 'Tomorrow' },
	{ name: 'Tuần này', value: 'CurrentWeek' },
	{ name: 'Tuần trước', value: 'LastWeek' },
	{ name: '7 ngày qua', value: 'TheLastWeek' },
	{ name: '7 ngày tới', value: 'TheNextWeek' },
];

const emptyOperators = new Set(['isEmpty', 'isNotEmpty']);
const dateOperators = new Set(['is', 'isGreater', 'isLess', ...emptyOperators]);
// Text, phone and URL filters accept one target string per condition.
// Select/user/link fields have their own array semantics and must stay unchanged.
const textFieldTypes = new Set([1, 13, 15]);
const textOperators = new Set(['is', 'isNot', 'contains', 'doesNotContain']);
const negativeOperators = new Set(['isNot', 'doesNotContain']);

interface FilterCondition extends IDataObject {
	field_name: string;
	operator: string;
	value: string[];
}

interface FilterGroup extends IDataObject {
	conjunction: 'and' | 'or';
	conditions: FilterCondition[];
}

function scalarString(value: unknown): string {
	if (typeof value === 'string') return value;
	if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))
		return String(value);
	throw new Error('Giá trị lọc cần là văn bản, số hoặc true/false.');
}

export async function buildStructuredFilter(
	input: unknown,
	conjunction: unknown,
	loadFields: () => Promise<LarkField[]>,
	timezone = 'UTC',
): Promise<IDataObject | undefined> {
	if (conjunction !== 'and' && conjunction !== 'or')
		throw new Error('Cách kết hợp bộ lọc cần là AND hoặc OR.');
	const collection = requireObject(input, 'Danh sách điều kiện');
	const entries = collection.condition ?? [];
	if (!Array.isArray(entries)) throw new Error('Danh sách điều kiện lọc cần là một mảng.');
	if (!entries.length) return undefined;
	const fields = await loadFields();
	const groups = entries.map<FilterGroup>((entry: unknown, index: number) => {
		try {
			const condition = requireObject(entry, 'Điều kiện lọc');
			const fieldName =
				condition.fieldSource === 'manual' ? condition.fieldNameManual : condition.fieldName;
			if (typeof fieldName !== 'string' || !fieldName)
				throw new Error('Cần chọn cột hoặc nhập đúng tên cột.');
			const field = fields.find((candidate) => candidate.field_name === fieldName);
			if (!field) throw new Error(`Không tìm thấy cột “${fieldName}” trong bảng đã chọn.`);
			const operator = condition.operator;
			if (!filterOperators.some((option) => option.value === operator))
				throw new Error('Cần chọn phép lọc hợp lệ của Lark.');
			const isDate =
				[5, 1001, 1002].includes(field.type) ||
				['DateTime', 'CreatedTime', 'LastModifiedTime'].includes(field.ui_type ?? '');
			if ((isDate || condition.valueMode === 'date') && !dateOperators.has(String(operator)))
				throw new Error('Cột ngày chỉ hỗ trợ là, lớn hơn, nhỏ hơn, rỗng hoặc không rỗng.');
			let value: string[] = [];
			if (!emptyOperators.has(String(operator))) {
				if (isDate && condition.valueMode !== 'date')
					throw new Error('Hãy chọn kiểu giá trị Ngày cho cột ngày.');
				switch (condition.valueMode ?? 'single') {
					case 'single':
						value = [scalarString(condition.singleValue)];
						if (!value[0].trim())
							throw new Error('Cần nhập giá trị; dùng phép Rỗng để tìm ô trống.');
						break;
					case 'multiple': {
						const raw = condition.multipleValues;
						// Không tách dấu phẩy vì tên lựa chọn/văn bản có thể chứa dấu phẩy.
						value = Array.isArray(raw)
							? raw.map(scalarString)
							: scalarString(raw)
									.split(/\r?\n/)
									.filter((line) => line.trim().length > 0);
						if (!value.length || value.some((item) => !item.trim()))
							throw new Error('Cần ít nhất một giá trị không rỗng, mỗi giá trị một dòng.');
						break;
					}
					case 'date': {
						const preset = condition.datePreset ?? 'ExactDate';
						if (!datePresets.some((option) => option.value === preset))
							throw new Error('Cần chọn mốc ngày hợp lệ.');
						value = [String(preset)];
						if (preset === 'ExactDate')
							value.push(String(normalizeFilterDate(condition.dateValue, field, timezone)));
						break;
					}
					default:
						throw new Error('Kiểu giá trị lọc không hợp lệ.');
				}
			}
			if (
				condition.valueMode === 'multiple' &&
				value.length > 1 &&
				textFieldTypes.has(field.type) &&
				textOperators.has(String(operator))
			) {
				return {
					conjunction: negativeOperators.has(String(operator)) ? 'and' : 'or',
					conditions: value.map((item) => ({
						field_name: fieldName,
						operator: String(operator),
						value: [item],
					})),
				};
			}
			return {
				conjunction,
				conditions: [{ field_name: fieldName, operator: String(operator), value }],
			};
		} catch (error) {
			throw new Error(
				`Điều kiện lọc ${index + 1}: ${error instanceof Error ? error.message : 'không hợp lệ'}`,
			);
		}
	});
	if (groups.length === 1) return groups[0];
	const conditions: FilterCondition[] = [];
	const children: FilterGroup[] = [];
	for (const group of groups) {
		if (group.conditions.length === 1 || group.conjunction === conjunction)
			conditions.push(...group.conditions);
		else children.push(group);
	}
	return { conjunction, conditions, ...(children.length ? { children } : {}) };
}
