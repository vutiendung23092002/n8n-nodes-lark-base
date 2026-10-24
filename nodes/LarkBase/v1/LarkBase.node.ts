import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { clientForContext, larkApiCredentialTest } from '../../../shared/transport/larkApiRequest';
import { getWorkflowRuntime } from '../../../shared/runtime';
import { recordOperations } from '../actions/record';
import { createMetadataLoader } from '../helpers/metadata';
import { buildRecordContext } from '../helpers/buildRecordContext';
import { searchTables } from '../methods/listSearch';
import { getFilterFields } from '../methods/loadOptions';
import { properties } from '../LarkBase.description';
import { usesTenantToken } from '../../../shared/transport/tokenAuthentication';

export class LarkBase implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Lark Base (Vutiendung)',
		name: 'larkBase',
		icon: 'file:../larkBase.svg',
		group: ['transform'],
		version: [1, 2, 3],
		defaultVersion: 3,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Đọc, tìm kiếm và ghi bản ghi trong Lark Base theo cấu trúc cột',
		defaults: { name: 'Lark Base (Vutiendung)' },
		// Giá trị chuỗi tương thích cả khi thư mục community resolve sang runtime dùng enum cũ.
		inputs: ['main'],
		outputs: ['main'],
		usableAsTool: true,
		credentials: [
			{
				name: 'vutiendungLarkApi',
				required: true,
				testedBy: 'larkApiTest',
				displayOptions: { hide: { authentication: ['tenantToken'] } },
			},
		],
		properties,
	};

	methods = {
		loadOptions: { getFilterFields },
		listSearch: { searchTables },
		credentialTest: {
			larkApiTest: larkApiCredentialTest,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const output: INodeExecutionData[] = [];
		if (!items.length) return [output];
		// Metadata node không cần khởi tạo runtime n8n; chỉ nạp helper lỗi khi thực thi.
		const { NodeOperationError } = getWorkflowRuntime();
		// Tạo client lười để lỗi credential vẫn tuân theo Continue On Fail cho từng item.
		let clientPromise: ReturnType<typeof clientForContext> | undefined;
		let metadata: ReturnType<typeof createMetadataLoader> | undefined;
		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const resource = this.getNodeParameter('resource', itemIndex) as string;
				const operation = this.getNodeParameter('operation', itemIndex) as string;
				const handler = Object.hasOwn(recordOperations, operation)
					? recordOperations[operation]
					: undefined;
				if (resource !== 'record' || !handler)
					throw new NodeOperationError(
						this.getNode(),
						'Tài nguyên hoặc thao tác Lark Base chưa được hỗ trợ.',
						{ itemIndex },
					);
				const directToken = usesTenantToken(this, itemIndex);
				const client = directToken
					? await clientForContext(this, itemIndex)
					: await (clientPromise ??= clientForContext(this, itemIndex));
				// Token có thể thay đổi theo item; không dùng metadata của token khác quyền.
				const metadataLoader = directToken
					? createMetadataLoader(client)
					: (metadata ??= createMetadataLoader(client));
				const result = await handler(
					await buildRecordContext(this, itemIndex, operation, client, metadataLoader),
				);
				// Không trải toàn bộ kết quả vào đối số hàm: Base lớn có thể vượt giới hạn call stack.
				for (const json of result) output.push({ json, pairedItem: { item: itemIndex } });
			} catch (error) {
				const message =
					error instanceof Error ? error.message : 'Không thể xử lý bản ghi Lark Base.';
				if (this.continueOnFail()) {
					output.push({ json: { error: message }, pairedItem: { item: itemIndex } });
					continue;
				}
				throw new NodeOperationError(this.getNode(), message, { itemIndex });
			}
		}
		return [output];
	}
}
