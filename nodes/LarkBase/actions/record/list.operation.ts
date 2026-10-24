import { searchRecords } from './search.operation';
import type { RecordOperation } from './types';

// API GET danh sách cũ đã được Lark đánh dấu không khuyến nghị; Search hỗ trợ phân trang hiện hành.
export const listRecords: RecordOperation = async (context) =>
	await searchRecords({ ...context, filter: undefined });
