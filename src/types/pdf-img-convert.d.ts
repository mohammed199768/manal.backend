declare module 'pdf-img-convert' {
    export interface ConvertOptions {
        width?: number;
        height?: number;
        page_numbers?: number[];
        base64?: boolean;
        scale?: number;
    }

    export function convert(
        pdf: string | Uint8Array | Buffer,
        options?: ConvertOptions
    ): Promise<string[] | Uint8Array[]>;
}
