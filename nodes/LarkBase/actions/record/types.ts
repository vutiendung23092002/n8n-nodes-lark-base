import type { IDataObject } from 'n8n-workflow';
import type { LarkClient, LarkField } from '../../../../shared/types';
import type { PaginationOptions } from '../../../../shared/pagination';

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
}

export type RecordOperation = (context: RecordContext) => Promise<IDataObject[]>;
