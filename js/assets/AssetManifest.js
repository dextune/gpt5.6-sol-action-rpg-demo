export async function loadAssetManifest(url = './assets/manifests/assets.json') {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Asset manifest load failed: ${response.status} ${url}`);
  return response.json();
}

export function modelUrl(descriptor, quality = 'high') {
  if (!descriptor) return null;
  if (typeof descriptor === 'string') return descriptor;
  if (descriptor.url) return descriptor.url;
  const lods = descriptor.lods ?? descriptor;
  return lods[quality] ?? lods.medium ?? lods.high ?? lods.low ?? null;
}

export function animationMap(manifest, key) {
  return manifest?.models?.[key]?.animationMap ?? {};
}
