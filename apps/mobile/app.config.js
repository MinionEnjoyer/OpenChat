/**
 * Dynamic Expo config — extends app.json.
 *
 * app.json is the canonical static config. This file layers on production-safety
 * overrides so a single env var gates cleartext traffic instead of requiring a
 * manual app.json edit before every production build.
 *
 *   EXPO_PUBLIC_DISABLE_CLEARTEXT=1  →  usesCleartextTraffic: false
 *   (unset)                          →  app.json default (true, for dev/E2E)
 */

const base = require('./app.json');

const disableCleartext =
  process.env.EXPO_PUBLIC_DISABLE_CLEARTEXT === '1' ||
  process.env.EXPO_PUBLIC_DISABLE_CLEARTEXT === 'true';

if (disableCleartext) {
  const plugins = (base.expo.plugins || []).map((p) => {
    if (Array.isArray(p) && p[0] === 'expo-build-properties') {
      const cfg = p[1] || {};
      return [
        'expo-build-properties',
        {
          ...cfg,
          android: {
            ...(cfg.android || {}),
            usesCleartextTraffic: false,
          },
        },
      ];
    }
    return p;
  });
  base.expo.plugins = plugins;
}

module.exports = base;
