import { TokenPayload } from './jwt';
import { AppError } from './app-error';

/**
 * Extracts a canonical User ID from various possible claim fields.
 * Handles: userId (canonical), id (legacy), sub (standard).
 */
export const getUserIdFromClaims = (user: Partial<TokenPayload> | undefined): string => {
    if (!user) {
        throw new AppError('Authentication required', 401);
    }

    // Cast to any to check for legacy fields that might not be in the interface
    const claims = user as any;

    const userId = claims.userId || claims.id || claims.sub;

    if (!userId) {
        throw new AppError('Invalid token: No user ID found in claims', 401);
    }

    return userId;
};

/**
 * Extracts role from claims, returning undefined if missing.
 */
export const getRoleFromClaims = (user: Partial<TokenPayload> | undefined): string | undefined => {
    if (!user) return undefined;
    return user.role;
};
