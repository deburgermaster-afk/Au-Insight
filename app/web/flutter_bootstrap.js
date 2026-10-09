{{flutter_js}}
{{flutter_build_config}}

// Fonts and assets load from a release-specific path (vercel.json maps it back to /assets).
// An older build cached them for a year, so a new path is the only way phones that kept those
// copies pick up new icons. Bump it whenever that kind of cache must be dropped again.
_flutter.loader.load({ config: { assetBase: "/r2/" } });
