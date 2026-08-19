import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DocumentApiService } from './document-api.service';

/** A file discovered while walking a dropped folder tree, with the relative path
 *  (slash-separated, root-relative) of the folder it lives in. The root of the drop
 *  has an empty `parentPath`, meaning "the target folder the user dropped onto". */
export interface TraversedFile {
  file: File;
  parentPath: string;
}

/** The flattened result of walking the dropped `FileSystemEntry` roots. */
export interface TraversedTree {
  /** Folder relative paths, in creation order (every parent precedes its children). */
  folderPaths: string[];
  /** All files, each tagged with the relative path of its parent folder. */
  files: TraversedFile[];
}

/**
 * Turns a folder dropped from the local filesystem into OpenFilz folders + files.
 *
 * Drag-and-drop hands us `FileSystemEntry` roots (see {@link DragDropDirective}); this
 * service walks them depth-first to discover the folder tree and every file, then
 * recreates that tree under a target folder (reusing folders that already exist so a
 * re-drop merges rather than fails). The caller uploads the files using the path→id map.
 */
@Injectable({ providedIn: 'root' })
export class FolderUploadService {
  private documentApi = inject(DocumentApiService);

  /**
   * Walk the dropped entries depth-first. Folders are collected parents-first so they
   * can be created in order; files keep the relative path of their parent folder.
   */
  async traverse(entries: FileSystemEntry[]): Promise<TraversedTree> {
    const folderPaths: string[] = [];
    const files: TraversedFile[] = [];

    const walk = async (entry: FileSystemEntry, parentPath: string): Promise<void> => {
      if (entry.isFile) {
        const file = await this.readFile(entry as FileSystemFileEntry);
        files.push({ file, parentPath });
        return;
      }
      if (entry.isDirectory) {
        const path = parentPath ? `${parentPath}/${entry.name}` : entry.name;
        folderPaths.push(path);
        const children = await this.readAllEntries(entry as FileSystemDirectoryEntry);
        for (const child of children) {
          await walk(child, path);
        }
      }
    };

    for (const entry of entries) {
      await walk(entry, '');
    }

    return { folderPaths, files };
  }

  /**
   * Create every folder path under `rootParentId`, returning a map of relative path →
   * created (or existing) folder id. Paths must be ordered parents-first (as produced
   * by {@link traverse}). A folder that already exists is reused so the dropped tree
   * merges into it instead of failing.
   */
  async createFolderTree(folderPaths: string[], rootParentId?: string): Promise<Map<string, string>> {
    const pathToId = new Map<string, string>();

    for (const path of folderPaths) {
      const slash = path.lastIndexOf('/');
      const name = slash >= 0 ? path.slice(slash + 1) : path;
      const parentPath = slash >= 0 ? path.slice(0, slash) : '';
      const parentId = parentPath ? pathToId.get(parentPath) : rootParentId;

      const existing = await firstValueFrom(this.documentApi.findExistingFolder(parentId, name));
      if (existing) {
        pathToId.set(path, existing.id);
        continue;
      }

      const created = await firstValueFrom(this.documentApi.createFolder({ name, parentId }));
      pathToId.set(path, created.id);
    }

    return pathToId;
  }

  /** Promise wrapper around the callback-based `FileSystemFileEntry.file()`. */
  private readFile(entry: FileSystemFileEntry): Promise<File> {
    return new Promise<File>((resolve, reject) => {
      entry.file(resolve, reject);
    });
  }

  /**
   * Read all children of a directory. `readEntries()` returns results in batches and
   * must be called repeatedly until it yields an empty array.
   */
  private async readAllEntries(directory: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
    const reader = directory.createReader();
    const all: FileSystemEntry[] = [];

    const readBatch = (): Promise<FileSystemEntry[]> =>
      new Promise<FileSystemEntry[]>((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });

    let batch = await readBatch();
    while (batch.length > 0) {
      all.push(...batch);
      batch = await readBatch();
    }
    return all;
  }
}
