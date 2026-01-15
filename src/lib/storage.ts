import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || './data';

export function getProjectDir(projectId: string): string {
  return path.join(DATA_DIR, 'projects', projectId);
}

export function getDocumentDir(projectId: string, documentId: string): string {
  return path.join(getProjectDir(projectId), 'docs', documentId);
}

export function getDocumentSourcePath(
  projectId: string,
  documentId: string,
  extension: string
): string {
  return path.join(getDocumentDir(projectId, documentId), `source.${extension}`);
}

export function getDocumentThumbnailPath(
  projectId: string,
  documentId: string,
  extension = 'png'
): string {
  return path.join(getDocumentDir(projectId, documentId), `thumbnail.${extension}`);
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function writeFile(filePath: string, data: Buffer | string): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  await fs.writeFile(filePath, data);
}

export async function readFile(filePath: string): Promise<Buffer> {
  return fs.readFile(filePath);
}

export async function readFileAsText(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8');
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function deleteFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    // Ignore if file doesn't exist
  }
}

export async function deleteDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: false });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }

    throw error;
  }
}
