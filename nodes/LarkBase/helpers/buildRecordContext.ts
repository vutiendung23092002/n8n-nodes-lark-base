import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import type { LarkClient } from '../../../shared/types';
import type { createMetadataLoader } from './metadata';
import type { RecordContext } from '../actions/record/types';
import { parseBaseUrl, validateId } from './parseBaseUrl';
import { parseJsonValue, requireObject } from './normalizeFields';
import { tablePath } from './metadata';
import { parseFilter, parseSort } from './searchOptions';
import { buildStructuredFilter } from './filterBuilder';
import { readUniqueFieldName } from './uniqueParameters';
import { uniqueOperations } from './uniqueKey';

export async function buildRecordContext(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: string,
	client: LarkClient,
	metadata: ReturnType<typeof createMetadataLoader>,
): Promise<RecordContext> {
	const base = parseBaseUrl(context.getNodeParameter('base', itemIndex) as string);
	const selectedTable = context.getNodeParameter('table', itemIndex, '', {
		extractValue: true,
	}) as string;
	const tableId = validateId((selectedTable || base.tableId || '').trim(), 'tbl');
	const reads = ['list', 'search'].includes(operation);
	const options = reads ? (context.getNodeParameter('options', itemIndex, {}) as IDataObject) : {};
	const view = options.viewId || (tableId === base.tableId ? base.viewId : undefined);
	const recordId = ['get', 'update', 'delete'].includes(operation)
		? validateId((context.getNodeParameter('recordId', itemIndex) as string).trim(), 'rec')
		: undefined;
	const fields = ['create', 'update', 'upsert', 'updateByUniqueKey'].includes(operation)
		? (requireObject(
				parseJsonValue(context.getNodeParameter('fields', itemIndex), 'Fields'),
				'Fields',
			) as IDataObject)
		: undefined;
	const batch = operation.startsWith('batch');
	const records = batch
		? parseJsonValue(context.getNodeParameter('records', itemIndex), 'Bản ghi')
		: undefined;
	if (batch && !Array.isArray(records)) throw new Error('Bản ghi theo lô phải là một mảng JSON.');
	let filter: IDataObject | undefined;
	if (operation === 'search') {
		const mode =
			context.getNode().typeVersion >= 3
				? context.getNodeParameter('filterMode', itemIndex, 'builder')
				: 'json';
		if (mode === 'builder') {
			filter = await buildStructuredFilter(
				context.getNodeParameter('filterConditions', itemIndex, {}),
				context.getNodeParameter('filterConjunction', itemIndex, 'and'),
				() => metadata(base.appToken, tableId),
				context.getTimezone(),
			);
		} else if (mode === 'json') {
			filter = parseFilter(context.getNodeParameter('filter', itemIndex, '{}'));
		} else throw new Error('Cách nhập bộ lọc không hợp lệ.');
	}
	return {
		client,
		path: tablePath(base.appToken, tableId),
		...(view ? { viewId: validateId(String(view).trim(), 'vew') } : {}),
		recordId,
		fields,
		records: records as unknown[] | undefined,
		batchSize: batch ? (context.getNodeParameter('batchSize', itemIndex, 500) as number) : 500,
		continueOnFail: context.continueOnFail(),
		pagination: {
			returnAll: reads
				? (context.getNodeParameter('returnAll', itemIndex, false) as boolean)
				: false,
			limit: reads ? (context.getNodeParameter('limit', itemIndex, 50) as number) : 50,
		},
		filter,
		sort: reads ? parseSort(options.sort) : undefined,
		metadata: () => metadata(base.appToken, tableId),
		...(uniqueOperations.includes(operation)
			? { uniqueKeyField: readUniqueFieldName(context, itemIndex) }
			: {}),
		...(operation === 'deleteByUniqueKey'
			? { uniqueKeyValue: context.getNodeParameter('uniqueKeyValue', itemIndex) }
			: {}),
		...(operation === 'create'
			? { clientToken: context.getNodeParameter('clientToken', itemIndex, '') as string }
			: {}),
	};
}
