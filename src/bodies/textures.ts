import type { Texture } from 'three';

/**
 * Loads a texture by site-relative path. Returns a Texture that fills in asynchronously, and calls
 * `onError` if it fails. Injected so bodies can be built in tests without a DOM.
 */
export type TextureLoaderFn = (path: string, onError: () => void) => Texture | null;

export const noTextures: TextureLoaderFn = () => null;
