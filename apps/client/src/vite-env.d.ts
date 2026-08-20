/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
  readonly VITE_PUBLIC_APP_URL?: string;
  readonly VITE_MAX_FILE_BYTES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
