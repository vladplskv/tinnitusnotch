/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_BASENAME: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
