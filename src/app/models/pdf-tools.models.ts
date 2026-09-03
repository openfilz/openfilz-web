/**
 * PDF tools API contract (`/api/v1/pdf/**`): merge, split, rotate and page organisation of
 * stored PDFs. Mirrors the backend DTOs (`org.openfilz.dms.dto.request.pdf` / `response.pdf`).
 */

export type OutputMode = 'NEW_DOCUMENT' | 'NEW_VERSION';

/** Destination of a single-output operation (merge, organize, rotate). */
export interface OutputTarget {
  /** Defaults: NEW_VERSION for organize/rotate, NEW_DOCUMENT for merge. */
  mode?: OutputMode;
  /** NEW_DOCUMENT: target folder; null/undefined = folder of the (first) source. */
  folderId?: string | null;
  /** NEW_DOCUMENT: file name (".pdf" appended when missing); null = derived from the source. */
  name?: string | null;
  allowDuplicateFileNames?: boolean;
  /** NEW_VERSION: required when the source is digitally signed. */
  acknowledgeSignatureLoss?: boolean;
}

export interface PdfPageInfo {
  /** 1-based */
  number: number;
  /** PDF points */
  width: number;
  height: number;
  /** The page's own /Rotate (0, 90, 180, 270) */
  rotation: number;
}

export interface PdfOutlineEntry {
  title: string;
  /** 1-based; null when the destination could not be resolved */
  page: number | null;
  /** 1 = top level */
  level: number;
}

export interface PdfInfo {
  documentId: string;
  name: string;
  size: number;
  pageCount: number;
  pages: PdfPageInfo[];
  /** Password-protected — cannot be transformed */
  encrypted: boolean;
  /** Digitally signed — any page change invalidates the signature */
  signed: boolean;
  /** A non-terminal e-Sign envelope references this PDF — in-place saves are refused */
  activeSignatureEnvelope: boolean;
  outline: PdfOutlineEntry[];
}

export interface MergeSource {
  documentId: string;
  /** Page selection such as "1-3,7,10-" (also all/odd/even); null = every page */
  pages?: string | null;
}

export interface MergeRequest {
  sources: MergeSource[];
  addOutline?: boolean;
  output?: OutputTarget;
}

export type SplitMode = 'EVERY_N_PAGES' | 'EVERY_PAGE' | 'AT_PAGES' | 'PAGE_RANGES' | 'BY_OUTLINE_LEVEL';

export interface SplitOutput {
  folderId?: string | null;
  /** {name}, {index}, {first}, {last}, {title}; default "{name}-{index}" */
  namePattern?: string | null;
  createSubfolder?: boolean;
  allowDuplicateFileNames?: boolean;
}

export interface SplitRequest {
  documentId: string;
  mode: SplitMode;
  n?: number | null;
  pages?: number[] | null;
  ranges?: string[] | null;
  outlineLevel?: number | null;
  output?: SplitOutput;
}

export interface PageInstruction {
  /** null = the main document */
  documentId?: string | null;
  /** 1-based page in the source */
  page: number;
  /** Extra clockwise rotation: 0, 90, 180, 270 */
  rotation?: number;
}

export interface OrganizeRequest {
  documentId: string;
  pages: PageInstruction[];
  output?: OutputTarget;
}

export interface RotateRequest {
  documentIds: string[];
  /** 90, 180 or 270 (clockwise) */
  angle: number;
  pages?: string | null;
  output?: OutputTarget;
}

export interface PdfOutputInfo {
  documentId: string;
  name: string;
  pageCount: number;
  size: number;
  versionId?: string | null;
}

export interface PdfOperationResponse {
  operation: 'merge' | 'split' | 'organize' | 'rotate' | string;
  outputs: PdfOutputInfo[];
}

/** The PDF tool actions surfaced in the toolbar / context menu. */
export type PdfToolActionId = 'organizePdf' | 'mergePdf' | 'splitPdf' | 'rotatePdf';

/** What a PDF tools dialog returns when it closes. */
export interface PdfToolResult {
  success: boolean;
  response?: PdfOperationResponse;
  /** Where the (single) output went — lets callers refresh in place vs. navigate. */
  mode?: OutputMode;
}
