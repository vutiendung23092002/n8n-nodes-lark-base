import { batchOperation } from './batch.operation';
import { createRecord } from './create.operation';
import { deleteRecord } from './delete.operation';
import { getRecord } from './get.operation';
import { listRecords } from './list.operation';
import { searchRecords } from './search.operation';
import { updateRecord } from './update.operation';
import type { RecordOperation } from './types';
import { batchUpsert, checkDuplicates, uniqueOperation } from './unique.operation';

export const recordOperations: Record<string, RecordOperation> = {
	list: listRecords,
	get: getRecord,
	create: createRecord,
	update: updateRecord,
	delete: deleteRecord,
	search: searchRecords,
	batchCreate: batchOperation('create'),
	batchUpdate: batchOperation('update'),
	batchDelete: batchOperation('delete'),
	upsert: uniqueOperation('upsert'),
	batchUpsert,
	updateByUniqueKey: uniqueOperation('updateByUniqueKey'),
	deleteByUniqueKey: uniqueOperation('deleteByUniqueKey'),
	checkDuplicates,
};
