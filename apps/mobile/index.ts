import { registerRootComponent } from 'expo';

import App from './App';

// FR-VOX-001: register LiveKit (WebRTC) globals before any LiveKit usage.
// Wrapped in try-catch because @livekit/react-native is a native module that
// does not exist in the Jest/node environment.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { registerGlobals } = require('@livekit/react-native');
  registerGlobals();
} catch {
  // Silence — native module not available (Jest, server-side rendering, etc.).
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
