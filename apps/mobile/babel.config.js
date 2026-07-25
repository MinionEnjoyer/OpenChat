// Required by react-native-reanimated: plugin must be listed last.
// Expo SDK 57 auto-configures the expo preset; this file only exists
// to add the reanimated plugin. Added by P3-T1 (DR-005).
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'],
  };
};