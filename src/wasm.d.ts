// Wrangler / @astrojs/cloudflare resolve a `.wasm` import to an instantiated
// `WebAssembly.Module` (their WASM-as-ESM contract). Type it so TS accepts the
// import that FormePDF's worker entry expects: `import wasm from '*.wasm'`.
declare module "*.wasm" {
  const mod: WebAssembly.Module;
  export default mod;
}
