/**
 * Provider registry
 *
 * Single source of truth for every available provider. To add a new
 * provider, implement the `Provider` interface and add it here.
 */

import type { Provider, ProviderId } from "./types";
import { animetsuProvider } from "./animetsu";
import { anikuroProvider } from "./anikuro";
import { animeyubiProvider } from "./animeyubi";
import { miruroProvider } from "./miruro";
import { animexProvider } from "./animex";
import { anilightProvider } from "./anilight";
import { anipmProvider } from "./anipm";

export const providers: Record<ProviderId, Provider> = {
  animetsu: animetsuProvider,
  anikuro: anikuroProvider,
  animeyubi: animeyubiProvider,
  miruro: miruroProvider,
  animex: animexProvider,
  anilight: anilightProvider,
  anipm: anipmProvider,
};

export const providerList: Provider[] = Object.values(providers);

export function getProvider(id: string): Provider {
  return providers[id as ProviderId] || animetsuProvider;
}

export function isProviderId(id: string): id is ProviderId {
  return id in providers;
}

export {
  animetsuProvider,
  anikuroProvider,
  animeyubiProvider,
  miruroProvider,
  animexProvider,
  anilightProvider,
  anipmProvider,
};
export * from "./types";
