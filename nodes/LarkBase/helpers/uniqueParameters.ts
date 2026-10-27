import type { IExecuteFunctions } from 'n8n-workflow';
import { UniqueKeyError } from './uniqueKey';

export function readUniqueFieldName(context: IExecuteFunctions, index: number): string {
	const source = context.getNodeParameter('uniqueKeySource', index, 'list');
	if (source !== 'list' && source !== 'manual')
		throw new UniqueKeyError('Cách chọn Unique Key Field không hợp lệ.');
	const name = context.getNodeParameter(
		source === 'manual' ? 'uniqueKeyFieldManual' : 'uniqueKeyField',
		index,
		'',
	);
	if (typeof name !== 'string' || !name.trim())
		throw new UniqueKeyError('Cần chọn Unique Key Field hoặc nhập tên cột.');
	return name;
}
