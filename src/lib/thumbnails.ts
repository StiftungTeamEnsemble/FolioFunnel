export const PDF_THUMBNAIL_COLUMN_KEY = 'pdf_thumbnail';
export const PDF_THUMBNAIL_FILENAME = 'thumbnail.png';

export function getDocumentThumbnailUrl(projectId: string, documentId: string) {
  return `/api/projects/${projectId}/documents/${documentId}/thumbnail`;
}
