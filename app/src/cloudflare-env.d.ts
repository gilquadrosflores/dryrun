// Extend CloudflareEnv to include the D1 database binding
declare interface CloudflareEnv {
  DB: D1Database;
}
