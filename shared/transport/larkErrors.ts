export class LarkRequestError extends Error {
	constructor(
		message: string,
		readonly operation: string,
		readonly httpStatus?: number,
		readonly larkCode?: number,
	) {
		super(message);
		this.name = 'LarkRequestError';
	}
}

export function redactSecrets(message: string, secrets: readonly string[]): string {
	let safe = message;
	for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) {
		safe = safe.split(secret).join('[đã ẩn]');
	}
	return safe.replace(/Bearer\s+[^\s"',;]+/gi, 'Bearer [đã ẩn]');
}

export function normalizeLarkError(
	operation: string,
	status: number | undefined,
	code: number | undefined,
	message: string | undefined,
	secrets: readonly string[],
): LarkRequestError {
	const hints: Record<number, string> = {
		99991663: 'Tenant access token không hợp lệ; hãy kiểm tra nền tảng và credential.',
		99991671: 'Access token không hợp lệ hoặc đã hết hạn; hãy kiểm tra credential.',
		1254003: 'App Token không hợp lệ. Hãy kiểm tra URL Base hoặc App Token.',
		1254004: 'Table ID không hợp lệ. Hãy chọn lại bảng.',
		1254302:
			'Ứng dụng chưa có quyền với Base. Hãy thêm ứng dụng vào Base và kiểm tra quyền nâng cao.',
		1254290: 'Lark đang giới hạn tần suất. Hãy giảm số lần gọi hoặc thử lại sau.',
		1254291: 'Base đang có thao tác ghi đồng thời. Hãy chạy tuần tự các thao tác ghi.',
	};
	const hint =
		(code === undefined ? undefined : hints[code]) ??
		(status === 403
			? 'Hãy kiểm tra scope API, chia sẻ Base cho ứng dụng và quyền nâng cao của bảng.'
			: status === 429
				? 'Lark đang giới hạn tần suất. Hãy thử lại sau.'
				: status === 404
					? 'Không tìm thấy tài nguyên. Hãy kiểm tra Base, bảng và Record ID.'
					: operation === 'xác thực ứng dụng Lark'
						? 'Kiểm tra App ID, App Secret, nền tảng và ứng dụng nội bộ đã được phát hành.'
						: 'Kiểm tra ID tài nguyên, scope API và quyền truy cập Base của ứng dụng.');
	const details = [
		`Không thể ${operation}.`,
		status === undefined ? '' : `HTTP: ${status}.`,
		code === undefined ? '' : `Mã lỗi Lark: ${code}.`,
		hint,
		message ? `Thông báo từ Lark: ${redactSecrets(message, secrets)}` : '',
	]
		.filter(Boolean)
		.join(' ');
	return new LarkRequestError(details, operation, status, code);
}
