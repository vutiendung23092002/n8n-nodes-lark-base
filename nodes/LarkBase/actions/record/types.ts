import type { IDataObject } from 'n8n-workflow';
import type { LarkClient, LarkField } from '../../../../shared/types';
import type { PaginationOptions } from '../../../../shared/pagination';
import type { PreparedUniqueRecord } from '../../helpers/uniqueKey';

export interface RecordContext {
	client: LarkClient;
	path: string;
	viewId?: string;
	recordId?: string;
	fields?: IDataObject;
	records?: unknown[];
	batchSize: number;
	continueOnFail: boolean;
	pagination: PaginationOptions;
	filter?: IDataObject;
	sort?: IDataObject[];
	metadata: () => Promise<LarkField[]>;
	uniqueKeyField?: string;
	uniqueKeyValue?: unknown;
	uniquePrepared?: PreparedUniqueRecord[];
	clientToken?: string;
}

export type RecordOperation = (context: RecordContext) => Promise<IDataObject[]>;
