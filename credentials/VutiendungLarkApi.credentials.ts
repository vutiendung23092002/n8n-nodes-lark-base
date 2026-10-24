import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class VutiendungLarkApi implements ICredentialType {
	// Tên credential dùng chung toàn instance, không được n8n thêm scope của package.
	name = 'vutiendungLarkApi';
	displayName = 'Lark API (Vutiendung)';
	documentationUrl =
		'https://open.larksuite.com/document/server-docs/authentication-management/access-token/tenant_access_token_internal';
	icon = 'file:../nodes/LarkBase/larkBase.svg' as const;
	supportedNodes = ['larkBase', 'larkAccessToken'];
	properties: INodeProperties[] = [
		{
			displayName: 'Nền tảng',
			name: 'platform',
			type: 'options',
			default: 'lark',
			options: [
				{ name: 'Lark', value: 'lark' },
				{ name: 'Feishu', value: 'feishu' },
			],
			description: 'Chọn nơi tạo ứng dụng; URL Base không tự thay đổi nền tảng xác thực.',
		},
		{
			displayName: 'App ID',
			name: 'appId',
			type: 'string',
			default: '',
			required: true,
			description: 'App ID của ứng dụng nội bộ trong Lark Developer Console.',
		},
		{
			displayName: 'App Secret',
			name: 'appSecret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'App Secret của ứng dụng nội bộ. Giá trị được n8n lưu trong credential đã mã hóa.',
		},
	];
}
