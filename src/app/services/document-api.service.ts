import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { filter, map, Observable } from 'rxjs';
import { Apollo, gql } from 'apollo-angular';
import {
  AncestorInfo,
  CopyRequest,
  CreateBlankDocumentRequest,
  CreateFolderRequest,
  DashboardStatistics,
  DeleteRequest,
  DocumentInfo,
  DocumentPosition,
  ElementInfo,
  AuditLog,
  FolderResponse,
  ListFolderAndCountResponse,
  MoveRequest,
  RecentFileInfo,
  RenameRequest,
  SearchByMetadataRequest,
  UploadResponse,
  MultipleUploadFileParameter,
  ListFolderRequest,
  FilterInput,
  SearchFilters,
  DocumentType,
  PartialUploadResult,
  UploadErrorGroup
} from '../models/document.models';
import { environment } from '../../environments/environment';

const LIST_FOLDER_QUERY = gql`
  query listFolder($request: ListFolderRequest!) {
    listFolder(request: $request) {
      id
      type
      contentType
      name
      size
      createdAt
      updatedAt
      createdBy
      updatedBy
      favorite
      thumbnailUrl
    }
  }
`;

const LIST_FOLDER_AND_COUNT_QUERY = gql`
  query listFolderAndCount($request1: ListFolderRequest!, $request2: ListFolderRequest) {
    listFolder(request: $request1) {
      id
      type
      contentType
      name
      size
      createdAt
      updatedAt
      createdBy
      updatedBy
      favorite
      thumbnailUrl
    }
    count(request: $request2)
  }
`;

const LIST_ALL_FOLDER_QUERY = gql`
  query listAllFolder($request: ListFolderRequest!) {
    listAllFolder(request: $request) {
      id
      type
      contentType
      name
      size
      createdAt
      updatedAt
      createdBy
      updatedBy
      favorite
      thumbnailUrl
    }
  }
`;

const LIST_FAVORITES_AND_COUNT_QUERY = gql`
  query listFavoritesAndCount($request1: FavoriteRequest!, $request2: FavoriteRequest) {
      listFavorites(request: $request1) {
      id
      type
      contentType
      name
      size
      createdAt
      updatedAt
      createdBy
      updatedBy
      favorite
      thumbnailUrl
    }
      countFavorites(request: $request2)
  }
`;

const SEARCH_DOCUMENTS_QUERY = gql`
  query searchDocuments(
    $query: String,
    $filters: [FilterInput!],
    $sort: SortInput,
    $page: Int = 1,
    $size: Int = 20
  ) {
    searchDocuments(
      query: $query,
      filters: $filters,
      sort: $sort,
      page: $page,
      size: $size
    ) {
      totalHits
      documents {
        id
        name
        extension
        contentType
        size
        parentId
        createdAt
        updatedAt
        createdBy
        updatedBy
        contentSnippet
        thumbnailUrl
      }
    }
  }
`;

const RECENT_FILES_QUERY = gql`
  query recentFiles($request: ListFolderRequest!) {
    listAllFolder(request: $request) {
      id
      type
      contentType
      name
      size
      createdAt
      updatedAt
      createdBy
      updatedBy
      favorite
      thumbnailUrl
    }
  }
`;

@Injectable({
  providedIn: 'root'
})
export class DocumentApiService {
  private readonly baseUrl = environment.apiURL;

  private http = inject(HttpClient);
  private apollo = inject(Apollo);

  constructor() { }

  // No manual Authorization header — we rely on the global authInterceptor() from
  // angular-auth-oidc-client (registered in main.ts with secureRoutes covering
  // environment.apiURL). For JSON requests, Angular's HttpClient sets Content-Type
  // automatically from the body; for FormData uploads, the browser sets
  // multipart/form-data with the correct boundary. Setting Content-Type manually on
  // multipart breaks the boundary generation, which is why the old getMultipartHeaders
  // deliberately left it out.

  private mapFiltersToRequest(filters?: SearchFilters): Partial<ListFolderRequest> {
    if (!filters) {
      return {};
    }

    const request: Partial<ListFolderRequest> = {};

    if (filters.type) {
      request.type = filters.type;
    }

    if (filters.owner) {
      request.createdBy = filters.owner;
    }

    if (filters.dateModified && filters.dateModified !== 'any') {
      const now = new Date();
      let date: Date | undefined;
      switch (filters.dateModified) {
        case 'today':
          date = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'last7':
          date = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'last30':
          date = new Date(now.setDate(now.getDate() - 30));
          break;
      }
      if (date) {
        request.updatedAtAfter = date.toISOString();
      }
    }

    if (filters.fileType && filters.fileType !== 'any') {
      request.contentType = filters.fileType;
    }

    if (filters.metadata && filters.metadata.length > 0) {
      request.metadata = this.toJsonMetadata(filters.metadata);
    }

    if (filters.scope === 'CURRENT_AND_SUBFOLDERS') {
      request.recursive = true;
    }

    return request;
  }

  listDeletedFolderAndCount(folderId?: string, page: number = 1, pageSize: number = 50): Observable<ListFolderAndCountResponse> {
    const request1 = {
      id: folderId,
      active: false,
      pageInfo: {
        pageNumber: page,
        pageSize: pageSize
      }
    };

    const request2 = {
      id: folderId,
      active: false
    };

    return this.apollo.watchQuery<any>({
      fetchPolicy: 'no-cache',
      query: LIST_FOLDER_AND_COUNT_QUERY,
      variables: { request1, request2 }
    }).valueChanges.pipe(
      filter(result => !result.loading),
      map(result => ({
        listFolder: result.data.listFolder,
        count: result.data.count
      }))
    );

  }


  // Folder operations
  listFolder(folderId?: string, page: number = 1, pageSize: number = 50, filters?: SearchFilters, sortBy?: string, sortOrder?: 'ASC' | 'DESC'): Observable<ElementInfo[]> {
    const filterRequest = this.mapFiltersToRequest(filters);
    const request = {
      id: folderId,
      pageInfo: {
        pageNumber: page,
        pageSize: pageSize,
        sortBy,
        sortOrder
      },
      ...filterRequest
    };

    return this.apollo.watchQuery<any>({
      fetchPolicy: 'no-cache',
      query: LIST_FOLDER_QUERY,
      variables: { request }
    }).valueChanges.pipe(
      filter(result => !result.loading),
      map(result => result.data.listFolder)
    );
  }

  listFolderAndCount(folderId?: string, page: number = 1, pageSize: number = 50, filters?: SearchFilters, sortBy?: string, sortOrder?: 'ASC' | 'DESC'): Observable<ListFolderAndCountResponse> {
    const filterRequest = this.mapFiltersToRequest(filters);
    const request1 = {
      id: folderId,
      pageInfo: {
        pageNumber: page,
        pageSize: pageSize,
        sortBy,
        sortOrder
      },
      ...filterRequest
    };

    const request2 = {
      id: folderId,
      ...filterRequest
    };

    return this.apollo.watchQuery<any>({
      fetchPolicy: 'no-cache',
      query: LIST_FOLDER_AND_COUNT_QUERY,
      variables: { request1, request2 }
    }).valueChanges.pipe(
      filter(result => !result.loading),
      map(result => ({
        listFolder: result.data.listFolder,
        count: result.data.count
      }))
    );
  }

  listAllFolderAndCount(page: number = 1, pageSize: number = 50, filters?: SearchFilters, sortBy?: string, sortOrder?: 'ASC' | 'DESC'): Observable<ListFolderAndCountResponse> {
    const filterRequest = this.mapFiltersToRequest(filters);
    const request = {
      pageInfo: {
        pageNumber: page,
        pageSize: pageSize,
        sortBy,
        sortOrder
      },
      ...filterRequest
    };

    return this.apollo.watchQuery<any>({
      fetchPolicy: 'no-cache',
      query: LIST_ALL_FOLDER_QUERY,
      variables: { request }
    }).valueChanges.pipe(
      filter(result => !result.loading),
      map(result => ({
        listFolder: result.data.listAllFolder,
        count: result.data.listAllFolder?.length ?? 0
      }))
    );
  }

  listFavoritesAndCount(page: number = 1, pageSize: number = 50, filters?: SearchFilters, sortBy?: string, sortOrder?: 'ASC' | 'DESC'): Observable<ListFolderAndCountResponse> {
    const filterRequest = this.mapFiltersToRequest(filters);
    const request1 = {
      pageInfo: {
        pageNumber: page,
        pageSize: pageSize,
        sortBy,
        sortOrder
      },
      ...filterRequest
    };

    const request2 = {
      ...filterRequest
    };

    return this.apollo.watchQuery<any>({
      fetchPolicy: 'no-cache',
      query: LIST_FAVORITES_AND_COUNT_QUERY,
      variables: { request1, request2 }
    }).valueChanges.pipe(
      filter(result => !result.loading),
      map(result => ({
        listFolder: result.data.listFavorites,
        count: result.data.countFavorites
      }))
    );
  }

  createFolder(request: CreateFolderRequest): Observable<FolderResponse> {
    return this.http.post<FolderResponse>(`${this.baseUrl}/folders`, request);
  }

  renameFolder(folderId: string, request: RenameRequest): Observable<ElementInfo> {
    return this.http.put<ElementInfo>(`${this.baseUrl}/folders/${folderId}/rename`, request);
  }

  moveFolders(request: MoveRequest): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/folders/move`, request);
  }

  copyFolders(request: CopyRequest): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/folders/copy`, request);
  }

  deleteFolders(request: DeleteRequest): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/folders`, {
      body: request
    });
  }

  // File operations
  renameFile(fileId: string, request: RenameRequest): Observable<ElementInfo> {
    return this.http.put<ElementInfo>(`${this.baseUrl}/files/${fileId}/rename`, request);
  }

  moveFiles(request: MoveRequest): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/files/move`, request);
  }

  copyFiles(request: CopyRequest): Observable<any[]> {
    return this.http.post<any[]>(`${this.baseUrl}/files/copy`, request);
  }

  deleteFiles(request: DeleteRequest): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/files`, {
      body: request
    });
  }

  // Document operations
  getDocumentInfo(documentId: string, withMetadata?: boolean): Observable<DocumentInfo> {
    let params = new HttpParams();
    if (withMetadata !== undefined) params = params.set('withMetadata', withMetadata.toString());

    return this.http.get<DocumentInfo>(`${this.baseUrl}/documents/${documentId}/info`, {
      params
    });
  }

  downloadDocument(documentId: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/documents/${documentId}/download`, {
      responseType: 'blob'
    });
  }

  downloadMultipleDocuments(documentIds: string[]): Observable<Blob> {
    return this.http.post(`${this.baseUrl}/documents/download-multiple`, documentIds, {
      responseType: 'blob'
    });
  }

  uploadDocument(file: File, parentFolderId?: string, metadata?: string, allowDuplicateFileNames?: boolean): Observable<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    if (parentFolderId) formData.append('parentFolderId', parentFolderId);
    if (metadata) formData.append('metadata', metadata);

    let params = new HttpParams();
    if (allowDuplicateFileNames !== undefined) {
      params = params.set('allowDuplicateFileNames', allowDuplicateFileNames.toString());
    }

    return this.http.post<UploadResponse>(`${this.baseUrl}/documents/upload`, formData, {
      params
    });
  }

  uploadMultipleDocuments(files: File[], parentFolderId?: string, allowDuplicateFileNames?: boolean, metadata?: { [key: string]: any }): Observable<HttpResponse<UploadResponse[]>> {
    const formData = new FormData();
    const parametersByFilename: MultipleUploadFileParameter[] = [];
    files.forEach(file => {
      formData.append('file', file, file.name);
      parametersByFilename.push({
        filename: file.name,
        fileAttributes: {
          parentFolderId: parentFolderId,
          metadata: metadata
        }
      });
    });
    if (parentFolderId || metadata) {
      formData.append('parametersByFilename', new Blob([JSON.stringify(parametersByFilename)], { type: 'application/json' }));
    }


    let params = new HttpParams();
    if (allowDuplicateFileNames !== undefined) {
      params = params.set('allowDuplicateFileNames', allowDuplicateFileNames.toString());
    }

    return this.http.post<UploadResponse[]>(`${this.baseUrl}/documents/upload-multiple`, formData, {
      params,
      observe: 'response'
    });
  }

  /**
   * Parses upload responses into a PartialUploadResult object.
   * Useful for handling HTTP 207 Multi-Status responses.
   */
  parseUploadResult(responses: UploadResponse[]): PartialUploadResult {
    const successResponses = responses.filter(r => !r.errorType);
    const errorResponses = responses.filter(r => !!r.errorType);

    // Group errors by errorType and sort by count (descending)
    const errorMap = new Map<string, UploadResponse[]>();
    errorResponses.forEach(r => {
      const type = r.errorType || 'Unknown';
      if (!errorMap.has(type)) {
        errorMap.set(type, []);
      }
      errorMap.get(type)!.push(r);
    });

    const errorGroups: UploadErrorGroup[] = Array.from(errorMap.entries())
      .map(([errorType, errors]) => ({
        errorType,
        count: errors.length,
        errors
      }))
      .sort((a, b) => b.count - a.count);

    return {
      successCount: successResponses.length,
      errorCount: errorResponses.length,
      errorGroups,
      responses
    };
  }

  replaceDocumentContent(documentId: string, file: File): Observable<ElementInfo> {
    const formData = new FormData();
    formData.append('file', file, file.name);

    return this.http.put<ElementInfo>(`${this.baseUrl}/documents/${documentId}/replace-content`, formData);
  }

  createBlankDocument(request: CreateBlankDocumentRequest): Observable<UploadResponse> {
    return this.http.post<UploadResponse>(`${this.baseUrl}/documents/create-blank`, request);
  }

  searchDocumentIdsByMetadata(request: SearchByMetadataRequest): Observable<string[]> {
    return this.http.post<string[]>(`${this.baseUrl}/documents/search/ids-by-metadata`, request);
  }

  updateDocumentMetadata(documentId: string, metadata: { [key: string]: any }): Observable<ElementInfo> {
    return this.http.patch<ElementInfo>(`${this.baseUrl}/documents/${documentId}/metadata`, { metadataToUpdate: metadata });
  }

  // Dashboard operations
  getDashboardStatistics(): Observable<DashboardStatistics> {
    return this.http.get<DashboardStatistics>(`${this.baseUrl}/dashboard/statistics`);
  }

  getRecentlyEditedFiles(limit: number = 5): Observable<RecentFileInfo[]> {
    const request = {
      type: 'FILE',
      pageInfo: {
        pageNumber: 1,
        pageSize: limit,
        sortBy: 'updatedAt',
        sortOrder: 'DESC'
      }
    };

    return this.apollo.watchQuery<any>({
      fetchPolicy: 'no-cache',
      query: RECENT_FILES_QUERY,
      variables: { request }
    }).valueChanges.pipe(
      filter(result => !result.loading),
      map(result => result.data?.listAllFolder ?? [])
    );
  }

  // Favorite operations
  addFavorite(documentId: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/favorites/${documentId}`, null);
  }

  removeFavorite(documentId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/favorites/${documentId}`);
  }

  toggleFavorite(documentId: string): Observable<boolean> {
    return this.http.put<boolean>(`${this.baseUrl}/favorites/${documentId}/toggle`, null);
  }

  favorite(documentId: string): Observable<boolean> {
    return this.http.get<boolean>(`${this.baseUrl}/favorites/${documentId}/is-favorite`);
  }

  listFavorites(): Observable<ElementInfo[]> {
    return this.http.get<ElementInfo[]>(`${this.baseUrl}/favorites`);
  }

  // Recycle Bin operations
  listDeletedItems(): Observable<ElementInfo[]> {
    return this.http.get<ElementInfo[]>(`${this.baseUrl}/recycle-bin`);
  }

  countDeletedItems(): Observable<number> {
    return this.http.get<number>(`${this.baseUrl}/recycle-bin/count`);
  }

  restoreItems(request: DeleteRequest): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/recycle-bin/restore`, request);
  }

  permanentlyDeleteItems(request: DeleteRequest): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/recycle-bin`, {
      body: request
    });
  }

  emptyRecycleBin(): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/recycle-bin/empty`);
  }

  searchDocuments(
    query: string | null,
    filters: SearchFilters | null,
    sort: any | null,
    page: number = 1,
    size: number = 20
  ): Observable<any> {
    const filterInputs: FilterInput[] = [];
    if (filters) {
      if (filters.type) {
        filterInputs.push({ field: 'type', value: filters.type });
      }
      if (filters.owner) {
        filterInputs.push({ field: 'createdBy', value: filters.owner });
      }
      if (filters.dateModified && filters.dateModified !== 'any') {
        const now = new Date();
        let date: Date | undefined;
        switch (filters.dateModified) {
          case 'today': date = new Date(now.setHours(0, 0, 0, 0)); break;
          case 'last7': date = new Date(now.setDate(now.getDate() - 7)); break;
          case 'last30': date = new Date(now.setDate(now.getDate() - 30)); break;
        }
        if (date) {
          filterInputs.push({ field: 'updatedAtAfter', value: date.toISOString() });
        }
      }
      if (filters.fileType && filters.fileType !== 'any') {
        filterInputs.push({ field: 'contentType', value: filters.fileType });
      }
      if (filters.metadata) {
        filters.metadata.forEach(meta => {
          if (meta.key && meta.value) {
            filterInputs.push({ field: 'metadata.' + meta.key, value: meta.value });
          }
        });
      }
    }

    return this.apollo.watchQuery<any>({
      fetchPolicy: 'no-cache',
      query: SEARCH_DOCUMENTS_QUERY,
      variables: { query, filters: filterInputs, sort, page, size }
    }).valueChanges.pipe(
      filter(result => !result.loading),
      map(result => result.data.searchDocuments)
    );
  }

  // Audit operations
  getAuditTrail(documentId: string, sortOrder: 'ASC' | 'DESC' = 'DESC'): Observable<AuditLog[]> {
    let params = new HttpParams().set('sort', sortOrder);
    return this.http.get<AuditLog[]>(`${this.baseUrl}/audit/${documentId}`, {
      params
    });
  }

  toJsonMetadata(metadata: { key: string; value: string; }[]): { [key: string]: any; } | undefined {
    if (!metadata || metadata.length === 0) {
      return undefined;
    }

    const jsonMetadata: { [key: string]: any; } = {};
    metadata.forEach(meta => {
      jsonMetadata[meta.key] = meta.value;
    });
    return jsonMetadata;
  }

  // Navigation operations for search suggestions
  getDocumentAncestors(documentId: string): Observable<AncestorInfo[]> {
    return this.http.get<AncestorInfo[]>(`${this.baseUrl}/documents/${documentId}/ancestors`);
  }

  getDocumentPosition(
    documentId: string,
    sortBy: string = 'name',
    sortOrder: 'ASC' | 'DESC' = 'ASC'
  ): Observable<DocumentPosition> {
    const params = new HttpParams()
      .set('sortBy', sortBy)
      .set('sortOrder', sortOrder);
    return this.http.get<DocumentPosition>(`${this.baseUrl}/documents/${documentId}/position`, {
      params
    });
  }

}

