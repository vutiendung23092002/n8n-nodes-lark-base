import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { clientForContext } from '../../../shared/transport/larkApiRequest';
import { createMetadataLoader } from '../helpers/metadata';
import { parseBaseUrl, validateId } from '../helpers/parseBaseUrl';

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
