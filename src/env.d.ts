declare namespace App {
  interface Locals {
    authenticated: boolean;
  }
}

// FormePDF's workerd entry imports the engine as a raw WebAssembly.Module
// (`import wasm from "@formepdf/core/pkg-web/forme_bg.wasm"`). Type the import
// so the strict build accepts it. @astrojs/cloudflare v13 inlines the bytes.
declare module "*.wasm" {
  const mod: WebAssembly.Module;
  export default mod;
}
