export interface AcquiredSourceFile {
  bytes: Uint8Array
  path: string
  sha256: string
}

export interface AcquiredSourceManifest {
  fileCount: number
  files: AcquiredSourceFile[]
  paths: Set<string>
  totalBytes: number
}
