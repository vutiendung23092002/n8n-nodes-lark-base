import { getWorkflowRuntime } from '../runtime';

export type RetryPolicy = 'read' | 'write' | 'idempotentCreate' | 'legacy';

export interface RetryOptions {
	policy?: RetryPolicy;
	sleep?: (ms: number) => Promise<void>;
	random?: () => number;
	now?: () => number;
}

export function createRetryController(options: RetryOptions = {}) {
	const policy = options.policy ?? 'legacy';
	const now = options.now ?? Date.now;
	const started = now();
	let waited = 0;
	const maxRetries = policy === 'read' ? 4 : policy === 'write' ? 0 : 2;
	return {
		policy,
		async wait(attempt: number, headers: Record<string, unknown> = {}): Promise<boolean> {
			if (attempt >= maxRetries) return false;
			const raw = Object.entries(headers).find(
				([name]) => name.toLowerCase() === 'retry-after',
			)?.[1];
			const header = Array.isArray(raw) ? raw[0] : raw;
			const text = typeof header === 'string' ? header.trim() : '';
			const numeric = text ? Number(text) : NaN;
			const requested = text
				? Number.isFinite(numeric)
					? numeric * 1000
					: Date.parse(text) - now()
				: NaN;
			const jitter =
				policy === 'legacy'
					? 0
					: Math.floor(Math.max(0, Math.min(1, (options.random ?? Math.random)())) * 250);
			const delay = Math.max(
				500 * 2 ** attempt + jitter,
				Number.isFinite(requested) ? requested : 0,
			);
			// Giới hạn cả từng lần chờ, tổng thời gian chờ và thời gian đã tiêu thụ của request.
			if (delay > 30000 || waited + delay > 30000 || now() - started + delay > 120000) return false;
			waited += delay;
			await (options.sleep ?? ((ms) => getWorkflowRuntime().sleep(ms)))(delay);
			return true;
		},
	};
}
