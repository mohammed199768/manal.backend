import axios from 'axios';
import crypto from 'crypto';
import { AppError } from '../../utils/app-error';

export class BunnyStreamService {
    private apiKey: string;
    private libraryId: string;
    private baseUrl = 'https://video.bunnycdn.com/library';

    constructor() {
        this.apiKey = process.env.BUNNY_STREAM_API_KEY || ''; // The "API Key" from Stream > API Key
        this.libraryId = process.env.BUNNY_STREAM_LIBRARY_ID || '';

        if (!this.apiKey || !this.libraryId) {
            throw new AppError('Bunny Stream is not properly configured. Missing BUNNY_STREAM_API_KEY or BUNNY_STREAM_LIBRARY_ID.', 500);
        }
    }

    // Initialize a video upload session
    async createVideo(title: string): Promise<{ videoId: string, authorizationSignature: string, expirationTime: number, libraryId: string }> {
        if (!this.apiKey || !this.libraryId) {
            throw new AppError('Video service not configured', 500);
        }

        try {
            const response = await axios.post(`${this.baseUrl}/${this.libraryId}/videos`, {
                title
            }, {
                headers: { AccessKey: this.apiKey }
            });

            const videoId = response.data.guid;

            // Generate a presigned upload signature for the frontend
            // Signature = sha256(libraryId + apiKey + expiration + videoId)
            const expirationTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour
            const signatureString = this.libraryId + this.apiKey + expirationTime + videoId;
            const authorizationSignature = crypto.createHash('sha256').update(signatureString).digest('hex');

            return {
                videoId,
                authorizationSignature,
                expirationTime,
                libraryId: this.libraryId
            };
        } catch (error: any) {
            console.error('Bunny Stream Create Error:', error.response?.data || error.message);
            throw new AppError('Failed to initialize video upload', 502);
        }
    }
}
