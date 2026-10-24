// Dùng mức 500 an toàn cho cả Lark và Feishu; một số API Feishu cho phép mức cao hơn.
export const MAX_BATCH_SIZE = 500;

export function chunkItems<T>(items: readonly T[], size = MAX_BATCH_SIZE): T[][] {
	if (!Number.isInteger(size) || size < 1 || size > MAX_BATCH_SIZE) {
		throw new Error(`Kích thước lô phải là số nguyên từ 1 đến ${MAX_BATCH_SIZE}.`);
	}
	const chunks: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}
	return chunks;
}
