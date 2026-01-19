export const PDF_THUMBNAIL_COLUMN_KEY = 'pdf_to_thumbnail_mupdf';
export const PDF_THUMBNAIL_FILENAME = 'thumbnail.png';

export function getDocumentThumbnailUrl(projectId: string, documentId: string) {
  return `/api/projects/${projectId}/documents/${documentId}/thumbnail`;
}
