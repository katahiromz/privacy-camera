// Type declarations for zxing-wasm/reader
declare module 'zxing-wasm/reader' {
  export interface Point {
    x: number;
    y: number;
  }

  export interface Position {
    topLeft: Point;
    topRight: Point;
    bottomRight: Point;
    bottomLeft: Point;
  }

  export interface ReadResult {
    format: string;
    text: string;
    bytes: Uint8Array;
    position: Position;
    orientation: number;
    ecLevel: string;
    contentType: string;
    symbologyIdentifier: string;
    sequenceSize: number;
    sequenceIndex: number;
    sequenceId: string;
    readerInit: boolean;
    lineCount: number;
    hasECI: boolean;
    isInverted: boolean;
    isMirrored: boolean;
  }

  export interface ReaderOptions {
    formats?: string[];
    tryHarder?: boolean;
    tryRotate?: boolean;
    tryInvert?: boolean;
    tryDownscale?: boolean;
    isPure?: boolean;
    binarizer?: string;
    downscaleFactor?: number;
    downscaleThreshold?: number;
    minLineCount?: number;
    maxNumberOfSymbols?: number;
    tryCode39ExtendedMode?: boolean;
    validateCode39CheckSum?: boolean;
    validateITFCheckSum?: boolean;
    returnCodabarStartEnd?: boolean;
    returnErrors?: boolean;
    eanAddOnSymbol?: string;
    textMode?: string;
    characterSet?: string;
  }

  export function readBarcodesFromImageData(
    imageData: ImageData,
    options?: ReaderOptions
  ): Promise<ReadResult[]>;

  export function readBarcodes(
    input: Blob | ArrayBuffer | Uint8Array | ImageData,
    options?: ReaderOptions
  ): Promise<ReadResult[]>;
}
