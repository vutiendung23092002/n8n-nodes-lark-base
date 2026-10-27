import type { IExecuteFunctions } from 'n8n-workflow';
import type { RecordContext } from '../actions/record/types';
import { createExecutionClientResolver } from '../../../shared/transport/larkApiRequest';
import type { LarkClient } from '../../../shared/types';
import { buildRecordContext } from './buildRecordContext';
import { createMetadataLoader, tablePath } from './metadata';
import { parseBaseUrl, validateId } from './parseBaseUrl';
import { parseJsonValue, requireObject } from './normalizeFields';
import {
	normalizeUniqueKey,
	prepareUniqueRecords,
	rawUniqueValue,
	selectUniqueField,
	UniqueKeyError,
	uniqueOperations,
} from './uniqueKey';
import { readUniqueFieldName } from './uniqueParameters';

export interface UniqueExecution {
	operation: string;
	context: RecordContext;
}
interface Draft {
	operation: string;
	scope: string;
}

export async function preflightUniqueExecution(
	context: IExecuteFunctions,
): Promise<Map<number, UniqueExecution | Error>> {
	const prepared = new Map<number, UniqueExecution | Error>();
	const drafts = new Map<number, Draft>();
	const rawEntries: Array<{ identity: string; index: number; value: string | number }> = [];
	for (let index = 0; index < context.getInputData().length; index++) {
		try {
			const operation = context.getNodeParameter('operation', index) as string;
			if (!uniqueOperations.includes(operation)) continue;
			const name = readUniqueFieldName(context, index);
			const base = parseBaseUrl(context.getNodeParameter('base', index) as string);
			const selected = context.getNodeParameter('table', index, '', {
				extractValue: true,
			}) as string;
			const path = tablePath(
				base.appToken,
				validateId((selected || base.tableId || '').trim(), 'tbl'),
			);
			const scope = JSON.stringify([path, name]);
			const input =
				operation === 'batchUpsert'
					? parseJsonValue(context.getNodeParameter('records', index), 'Bản ghi')
					: operation === 'checkDuplicates'
						? []
						: operation === 'deleteByUniqueKey'
							? [{ fields: { [name]: context.getNodeParameter('uniqueKeyValue', index) } }]
							: [{ fields: parseJsonValue(context.getNodeParameter('fields', index), 'Fields') }];
			if (!Array.isArray(input) || (!input.length && operation !== 'checkDuplicates'))
				throw new UniqueKeyError('Batch Upsert cần mảng bản ghi không rỗng.');
			const values = input.map((entry) =>
				rawUniqueValue(requireObject(requireObject(entry, 'Bản ghi').fields, 'Fields')[name]),
			);
			drafts.set(index, { operation, scope });
			for (const value of values)
				rawEntries.push({ index, value, identity: JSON.stringify([scope, String(value)]) });
		} catch (error) {
			prepared.set(
				index,
				error instanceof Error ? error : new UniqueKeyError('Input Unique Key không hợp lệ.'),
			);
		}
	}
	const markDuplicates = (entries: typeof rawEntries) => {
		const groups = new Map<string, typeof rawEntries>();
		for (const entry of entries) {
			const group = groups.get(entry.identity) ?? [];
			group.push(entry);
			groups.set(entry.identity, group);
		}
		for (const group of groups.values())
			if (group.length > 1)
				for (const { index, value } of group)
					prepared.set(
						index,
						new UniqueKeyError(
							`Unique Key ${JSON.stringify(value)} bị trùng trong input của node. Không tự chọn bản ghi đầu/cuối.`,
							{ unique_key: value, lookup_status: 'failed' },
						),
					);
	};
	markDuplicates(rawEntries);
	// Nếu dừng khi lỗi, toàn bộ preflight thô phải đạt trước cả request metadata/xác thực.
	if (!context.continueOnFail() && [...prepared.values()].some((entry) => entry instanceof Error))
		return prepared;
	const canonicalEntries: typeof rawEntries = [];
	const clientForItem = createExecutionClientResolver(context);
	const metadataByClient = new Map<LarkClient, ReturnType<typeof createMetadataLoader>>();
	for (const [index, draft] of drafts) {
		if (prepared.has(index)) continue;
		try {
			const client = await clientForItem(index);
			let metadata = metadataByClient.get(client);
			if (!metadata) {
				metadata = createMetadataLoader(client);
				metadataByClient.set(client, metadata);
			}
			const recordContext = await buildRecordContext(
				context,
				index,
				draft.operation,
				client,
				metadata,
			);
			const schema = await recordContext.metadata();
			const field = selectUniqueField(schema, recordContext.uniqueKeyField);
			if (draft.operation !== 'checkDuplicates') {
				recordContext.uniquePrepared =
					draft.operation === 'deleteByUniqueKey'
						? [
								{
									key: normalizeUniqueKey(recordContext.uniqueKeyValue, field),
									fields: {},
									index: 0,
								},
							]
						: prepareUniqueRecords(
								draft.operation === 'batchUpsert'
									? recordContext.records!
									: [{ fields: recordContext.fields }],
								field,
								schema,
							);
				for (const { key } of recordContext.uniquePrepared)
					canonicalEntries.push({
						index,
						value: key.value,
						identity: JSON.stringify([draft.scope, key.identity]),
					});
			}
			prepared.set(index, { operation: draft.operation, context: recordContext });
		} catch (error) {
			prepared.set(
				index,
				error instanceof Error ? error : new UniqueKeyError('Không thể kiểm tra Unique Key.'),
			);
		}
	}
	markDuplicates(canonicalEntries);
	return prepared;
}
