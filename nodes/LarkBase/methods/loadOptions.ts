import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { clientForContext } from '../../../shared/transport/larkApiRequest';
import { createMetadataLoader } from '../helpers/metadata';
import { parseBaseUrl, validateId } from '../helpers/parseBaseUrl';
import { isUniqueField } from '../helpers/uniqueKey';

export async function getFilterFields(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const base = parseBaseUrl(this.getNodeParameter('base') as string);
	const selected = this.getNodeParameter('table', '', { extractValue: true }) as string;
	const tableId = validateId((selected || base.tableId || '').trim(), 'tbl');
	const client = await clientForContext(this);
	const fields = await createMetadataLoader(client)(base.appToken, tableId);
	return fields.map((field) => ({
		name: field.field_name,
		value: field.field_name,
		description: `${field.ui_type ?? `Kiểu ${field.type}`} — ${field.field_id}`,
	}));
}

export async function getUniqueKeyFields(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const base = parseBaseUrl(this.getNodeParameter('base') as string);
	const selected = this.getNodeParameter('table', '', { extractValue: true }) as string;
	const tableId = validateId((selected || base.tableId || '').trim(), 'tbl');
	const fields = await createMetadataLoader(await clientForContext(this))(base.appToken, tableId);
	return fields.filter(isUniqueField).map((field) => ({
		name: field.field_name,
		value: field.field_name,
		description: `${field.type === 1 ? 'Text' : 'Number'} — ${field.field_id}`,
	}));
}
