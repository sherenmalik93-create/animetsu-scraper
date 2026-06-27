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
import { mkissaProvider } from "./mkissa";
import { animeverseProvider } from "./animeverse";
import { animedunyaProvider } from "./animedunya";
import { animekhorProvider } from "./animekhor";
import { onisagaProvider } from "./onisaga";

export const providers: Record<ProviderId, Provider> = {
  animetsu: animetsuProvider,
  anikuro: anikuroProvider,
  animeyubi: animeyubiProvider,
  miruro: miruroProvider,
  animex: animexProvider,
  anilight: anilightProvider,
  anipm: anipmProvider,
  mkissa: mkissaProvider,
  animeverse: animeverseProvider,
  animedunya: animedunyaProvider,
  animekhor: animekhorProvider,
  onisaga: onisagaProvider,
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
  mkissaProvider,
  animeverseProvider,
  animedunyaProvider,
  animekhorProvider,
  onisagaProvider,
};
export * from "./types";
