/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
  readonly VITE_PUBLIC_APP_URL?: string;
  readonly VITE_MAX_FILE_BYTES?: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_APP_VERSION_CODE?: string;
  readonly VITE_RELEASE_TAG?: string;
  readonly VITE_UPDATE_MANIFEST_URL?: string;
  readonly VITE_ENABLE_UPDATE_CHECKS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
