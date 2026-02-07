import { AppError } from '../../utils/app-error';
import pdfImgConvert from 'pdf-img-convert';

export class RenderingService {
    /**
     * Renders a PDF buffer into an array of PNG buffers.
     * @param buffer Raw PDF buffer
     * @returns Array of Buffer (one per page)
     */
    async renderPdfToImages(buffer: Buffer): Promise<Buffer[]> {
        try {
            // Convert to array of Uint8Array (images)
            // Default scale is 1.0. We might want higher resolution?
            // pdf-img-convert defaults to 1.0 (72dpi?). 2.0 is often better for reading.
            const outputImages = await pdfImgConvert.convert(buffer, {
                scale: 2.0
            });

            // The library returns Uint8Array[] or string[]. We expect buffers.
            // Map Uint8Array to Buffer
            return outputImages.map((img: any) => Buffer.from(img));
        } catch (error) {
            console.error('[RenderingService] Failed to render PDF:', error);
            throw new AppError('Failed to parse or render document', 422);
        }
    }
}
