interface Env {
  /** Inline JWKS for tests and `wrangler dev` only (docs/adr/0013); absent in production. */
  readonly ACCESS_JWKS?: string;
}
