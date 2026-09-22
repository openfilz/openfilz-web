import { Injectable, inject } from '@angular/core';
import { Apollo, gql } from 'apollo-angular';
import { map, Observable, of } from 'rxjs';

import type { FileViewerItem } from '../dialogs/file-viewer-dialog/file-viewer-dialog.component';
import { SearchFilters } from '../models/document.models';
import { getFileTypePatterns } from '../models/file-type-filters';
import { determineViewerMode } from '../utils/viewer-mode.util';
import { DocumentApiService } from './document-api.service';

/**
 * The images the file viewer steps through with its previous / next arrows: the images of the
 * listing the viewer was opened from (a folder, the favorites, a search), in the listing's order.
 * A listing may hold thousands of them, so they are counted up front and fetched page by page.
 */
export interface ImageGallery {
  /** Number of images, and the 0-based index of `documentId` among them (null when it is not one). */
  locate(documentId: string): Observable<{ total: number; index: number | null }>;
  /** Page `page` (0-based) of `size` images. */
  page(page: number, size: number): Observable<FileViewerItem[]>;
}

type SortOrder = 'ASC' | 'DESC';

const IMAGE_FIELDS = `id name contentType size`;

const LOCATE_IN_FOLDER_QUERY = gql`
  query locateImageInFolder($count: ListFolderRequest, $position: ListFolderRequest!, $documentId: UUID!) {
    count(request: $count)
    listFolderPosition(request: $position, documentId: $documentId)
  }
`;

const LOCATE_IN_ALL_FOLDERS_QUERY = gql`
  query locateImageInAllFolders($count: ListFolderRequest, $position: ListFolderRequest!, $documentId: UUID!) {
    countAllFolder(request: $count)
    listAllFolderPosition(request: $position, documentId: $documentId)
  }
`;

const FOLDER_IMAGES_QUERY = gql`
  query folderImages($request: ListFolderRequest!) {
    listFolder(request: $request) { ${IMAGE_FIELDS} }
  }
`;

const ALL_FOLDERS_IMAGES_QUERY = gql`
  query allFoldersImages($request: ListFolderRequest!) {
    listAllFolder(request: $request) { ${IMAGE_FIELDS} }
  }
`;

@Injectable({ providedIn: 'root' })
export class ImageGalleryService {
  private readonly apollo = inject(Apollo);
  private readonly documentApi = inject(DocumentApiService);

  /** The images of a folder listing (with its filters; `scope: CURRENT_AND_SUBFOLDERS` includes the sub-folders). */
  folder(folderId: string | undefined, filters: SearchFilters | undefined, sortBy: string, sortOrder: SortOrder): ImageGallery {
    return this.listing('folder', { id: folderId }, filters, sortBy, sortOrder);
  }

  /** The images of the whole library, as the "all files" search scope lists them. */
  allFolders(filters: SearchFilters | undefined, sortBy: string, sortOrder: SortOrder): ImageGallery {
    return this.listing('all', {}, filters, sortBy, sortOrder);
  }

  /** The images among the user's favorites. */
  favorites(filters: SearchFilters | undefined, sortBy: string, sortOrder: SortOrder): ImageGallery {
    return this.listing('all', { favorite: true }, filters, sortBy, sortOrder);
  }

  private listing(kind: 'folder' | 'all', scope: object, filters: SearchFilters | undefined,
                  sortBy: string, sortOrder: SortOrder): ImageGallery {
    // Same request as the listing on screen, narrowed to the images
    const base = { ...this.documentApi.mapFiltersToRequest(filters), ...scope, contentTypes: getFileTypePatterns('images') };
    const pageInfo = (pageNumber: number, pageSize: number) => ({ pageNumber, pageSize, sortBy, sortOrder });
    const query = <T>(document: ReturnType<typeof gql>, variables: object) =>
      this.apollo.query<T>({ query: document, variables, fetchPolicy: 'no-cache' }).pipe(map(result => result.data as T));

    return {
      locate: documentId => query<any>(kind === 'folder' ? LOCATE_IN_FOLDER_QUERY : LOCATE_IN_ALL_FOLDERS_QUERY, {
        count: base,
        // Paging is ignored by the position query, but the request type requires it
        position: { ...base, pageInfo: pageInfo(1, 1) },
        documentId
      }).pipe(map(data => ({
        total: Number((kind === 'folder' ? data.count : data.countAllFolder) ?? 0),
        index: toIndex(kind === 'folder' ? data.listFolderPosition : data.listAllFolderPosition)
      }))),
      page: (page, size) => query<any>(kind === 'folder' ? FOLDER_IMAGES_QUERY : ALL_FOLDERS_IMAGES_QUERY, {
        request: { ...base, pageInfo: pageInfo(page + 1, size) }
      }).pipe(map(data => ((kind === 'folder' ? data.listFolder : data.listAllFolder) ?? []).map(toViewerItem)))
    };
  }
}

/** A gallery over items already in memory (e.g. full-text search results, which are not paged). */
export function inMemoryImageGallery(items: FileViewerItem[]): ImageGallery {
  const images = items.filter(item => determineViewerMode(item.fileName, item.contentType) === 'image');
  return {
    locate: documentId => {
      const index = images.findIndex(item => item.documentId === documentId);
      return of({ total: images.length, index: index >= 0 ? index : null });
    },
    page: (page, size) => of(images.slice(page * size, (page + 1) * size))
  };
}

function toIndex(position: unknown): number | null {
  return position === null || position === undefined ? null : Number(position);
}

function toViewerItem(element: { id: string; name: string; contentType?: string; size?: number }): FileViewerItem {
  return {
    documentId: element.id,
    fileName: element.name,
    contentType: element.contentType || '',
    fileSize: element.size
  };
}
