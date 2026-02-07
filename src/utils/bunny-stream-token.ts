import crypto from 'crypto';

export interface StreamTokenOptions {
    videoId: string;
    expiresInSeconds?: number;
    securityKey: string;
    libraryId: string;
}

export interface StreamTokenResult {
    token: string;
    expires: number;
    embedUrl: string;
}

export function signBunnyStreamUrl(options: StreamTokenOptions): StreamTokenResult {
    const { videoId, expiresInSeconds = 3600, securityKey, libraryId } = options;
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;

    // Token = SHA256(securityKey + videoId + expiration)
    const data = securityKey + videoId + expires;
    const token = crypto.createHash('sha256').update(data).digest('hex');

    return {
        token,
        expires,
        embedUrl: `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}?token=${token}&expires=${expires}`
    };
}
