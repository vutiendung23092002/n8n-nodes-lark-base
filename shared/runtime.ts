export function getWorkflowRuntime(): typeof import('n8n-workflow') {
	// n8n nạp community node bằng CommonJS. Require lười giữ đúng nhánh CJS,
	// tránh khởi tạo barrel runtime khi đăng ký metadata và tránh nhánh ESM khác hành vi.
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	return require('n8n-workflow') as typeof import('n8n-workflow');
}
