import type { BaseReference } from '../../../shared/types';

export function validateId(value: string, prefix: 'tbl' | 'vew' | 'rec'): string {
	if (!new RegExp(`^${prefix}[a-zA-Z0-9]+$`).test(value)) {
		throw new Error(`ID không hợp lệ: cần giá trị bắt đầu bằng ${prefix} và chỉ gồm chữ, số.`);
	}
	return value;
}

export function parseBaseUrl(input: string): BaseReference {
	const value = input.trim();
	if (/^[a-zA-Z0-9]+$/.test(value)) return { appToken: value };
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error('URL Lark Base không hợp lệ. Hãy dán URL đầy đủ hoặc nhập App Token.');
	}
	const domains = ['larksuite.com', 'feishu.cn', 'larkoffice.com'];
	if (
		url.protocol !== 'https:' ||
		url.username ||
		url.password ||
		url.port ||
		!domains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))
	) {
		throw new Error('URL phải dùng HTTPS và thuộc miền Lark hoặc Feishu được hỗ trợ.');
	}
	if (url.pathname.startsWith('/wiki/')) {
		throw new Error(
			'URL Wiki chưa được hỗ trợ. Hãy nhập App Token của Base gốc thay cho Wiki token.',
		);
	}
	const match = /^\/base\/([a-zA-Z0-9]+)\/?$/.exec(url.pathname);
	if (!match) throw new Error('Không thể xác định App Token từ URL Lark Base đã cung cấp.');
	const table = url.searchParams.get('table');
	const view = url.searchParams.get('view');
	return {
		appToken: match[1],
		...(table ? { tableId: validateId(table, 'tbl') } : {}),
		...(view ? { viewId: validateId(view, 'vew') } : {}),
	};
}
