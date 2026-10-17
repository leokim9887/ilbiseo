/** Minimal File System Access API typings */
interface FileSystemWritableFileStream extends WritableStream {
  write(
    data:
      | BufferSource
      | Blob
      | string
      | {
          type: "write";
          position?: number;
          data: BufferSource | Blob | string;
        }
      | { type: "seek"; position: number }
      | { type: "truncate"; size: number },
  ): Promise<void>;
  truncate(size: number): Promise<void>;
  seek(position: number): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

interface FileSystemFileHandle {
  readonly kind: "file";
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(options?: {
    keepExistingData?: boolean;
  }): Promise<FileSystemWritableFileStream>;
  queryPermission?(descriptor: {
    mode?: "read" | "readwrite";
  }): Promise<PermissionState>;
  requestPermission(descriptor: {
    mode?: "read" | "readwrite";
  }): Promise<PermissionState>;
}

interface Window {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: {
      description?: string;
      accept: Record<string, string[]>;
    }[];
  }) => Promise<FileSystemFileHandle>;
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    types?: {
      description?: string;
      accept: Record<string, string[]>;
    }[];
  }) => Promise<FileSystemFileHandle[]>;
}
