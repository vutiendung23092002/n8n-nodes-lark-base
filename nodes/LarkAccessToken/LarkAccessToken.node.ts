import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { getTenantAccessToken, readCredentials } from '../../shared/transport/getTenantAccessToken';
import { getWorkflowRuntime } from '../../shared/runtime';
import { larkApiCredentialTest } from '../../shared/transport/larkApiRequest';

export class LarkAccessToken implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Lark Access Token (Vutiendung)',
		name: 'larkAccessToken',
		icon: 'file:../LarkBase/larkBase.svg',
		group: ['transform'],
		version: [1, 2],
		defaultVersion: 2,
		description:
			'Lấy Tenant Access Token từ App ID và App Secret để truyền cho các node Lark phía sau',
		defaults: { name: 'Lark Access Token' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'vutiendungLarkApi',
				required: true,
				testedBy: 'larkApiTest',
				displayOptions: { show: { '@version': [2] } },
			},
		],
		properties: [
			{
				displayName: 'Nền tảng',
				name: 'platform',
				type: 'options',
				default: 'lark',
				displayOptions: { show: { '@version': [1] } },
				options: [
					{ name: 'Lark', value: 'lark' },
					{ name: 'Feishu', value: 'feishu' },
				],
				description: 'Chọn nền tảng đã tạo ứng dụng nội bộ',
			},
			{
				displayName: 'App ID',
				name: 'appId',
				displayOptions: { show: { '@version': [1] } },
				type: 'string',
				default: '',
				required: true,
				description: 'App ID của ứng dụng nội bộ. Có thể truyền bằng expression.',
			},
			{
				displayName: 'App Secret',
				name: 'appSecret',
				displayOptions: { show: { '@version': [1] } },
				type: 'string',
				default: '',
				required: true,
				typeOptions: { password: true },
				description:
					'App Secret của ứng dụng nội bộ. Hỗ trợ expression; không được trả lại trong output.',
			},
			{
				displayName:
					'Token đầu ra có thể dùng qua {{$json.tenant_access_token}}. App Secret nhập trực tiếp được lưu trong workflow; token đầu ra có thể được lưu trong lịch sử thực thi.',
				name: 'tokenNotice',
				displayOptions: { show: { '@version': [1] } },
				type: 'notice',
				default: '',
			},
			{
				displayName:
					'Chọn credential Lark API (Vutiendung) ở trên để lưu App ID/App Secret trong kho credential của n8n. Node Base phía sau chỉ nhận tenant_access_token; token đầu ra vẫn có thể được lưu trong lịch sử thực thi.',
				name: 'credentialNotice',
				type: 'notice',
				default: '',
				displayOptions: { show: { '@version': [2] } },
			},
		],
	};

	methods = { credentialTest: { larkApiTest: larkApiCredentialTest } };

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const output: INodeExecutionData[] = [];
		for (let itemIndex = 0; itemIndex < this.getInputData().length; itemIndex++) {
			try {
				const credentials = readCredentials(
					this.getNode().typeVersion >= 2
						? await this.getCredentials('vutiendungLarkApi')
						: {
								appId: this.getNodeParameter('appId', itemIndex),
								appSecret: this.getNodeParameter('appSecret', itemIndex),
								platform: this.getNodeParameter('platform', itemIndex, 'lark'),
							},
				);
				const token = await getTenantAccessToken(this.helpers.httpRequest.bind(this), credentials);
				output.push({
					json: { ...token, token_type: 'Bearer', platform: credentials.platform },
					pairedItem: { item: itemIndex },
				});
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: 'Không thể lấy Tenant Access Token của ứng dụng Lark.';
				if (this.continueOnFail()) {
					output.push({ json: { error: message }, pairedItem: { item: itemIndex } });
					continue;
				}
				const { NodeOperationError } = getWorkflowRuntime();
				throw new NodeOperationError(this.getNode(), message, { itemIndex });
			}
		}
		return [output];
	}
}
