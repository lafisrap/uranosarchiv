/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_R2_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
