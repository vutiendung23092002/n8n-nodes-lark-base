import type { IDataObject, IHttpRequestMethods } from 'n8n-workflow';

export interface LarkResponse<T> {
	code: number;
	msg?: string;
	data?: T;
}

export interface TokenResponse {
	code: number;
	msg?: string;
	tenant_access_token?: string;
	expire?: number;
}

export interface LarkPage<T> {
	items?: T[];
	has_more?: boolean;
	page_token?: string;
	total?: number;
}

export interface TenantAccessToken {
	tenant_access_token: string;
	expire: number;
	expires_at: number;
}

export interface LarkRecord extends IDataObject {
	record_id: string;
	fields: IDataObject;
}

export interface LarkTable {
	table_id: string;
	name: string;
}

export interface LarkField {
	field_id: string;
	field_name: string;
	type: number;
	ui_type?: string;
	property?: { options?: Array<{ name: string; id?: string }> };
}

export interface BaseReference {
	appToken: string;
	tableId?: string;
	viewId?: string;
}

export interface ApiRequest {
	method: IHttpRequestMethods;
	path: string;
	operation: string;
	qs?: IDataObject;
	body?: IDataObject;
}

export interface LarkClient {
	request<T>(request: ApiRequest): Promise<T>;
}

export interface TokenProvider {
	getToken(forceRefresh?: boolean): Promise<string>;
}
