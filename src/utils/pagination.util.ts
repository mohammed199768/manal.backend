
export interface PaginationOptions {
    page?: number | string;
    limit?: number | string;
    maxLimit?: number;
}

export interface PaginationResult<T> {
    data: T[];
    meta: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
        hasNextPage: boolean;
        hasPrevPage: boolean;
    };
}

export class PaginationUtil {
    static parse(options: PaginationOptions) {
        const page = Math.max(1, Number(options.page) || 1);
        const limit = Math.max(1, Math.min(Number(options.limit) || 10, options.maxLimit || 100));
        const skip = (page - 1) * limit;

        return {
            page,
            limit,
            skip,
            take: limit
        };
    }

    static format<T>(data: T[], total: number, page: number, limit: number): PaginationResult<T> {
        const totalPages = Math.ceil(total / limit);

        return {
            data,
            meta: {
                total,
                page,
                limit,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        };
    }
}
