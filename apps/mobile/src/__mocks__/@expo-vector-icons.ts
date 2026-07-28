/**
 * Mock for @expo/vector-icons — avoids pulling in expo-font / expo-asset
 * during unit tests. The component renders a simple View with the icon name
 * as testID so tests can still assert on icon presence.
 */
import React from 'react';
import { View } from 'react-native';

export function MaterialIcons(props: { name: string; size?: number; color?: string; style?: any; testID?: string }): React.JSX.Element {
  return React.createElement(View, { testID: props.testID ?? `icon-${props.name}`, ...(props.style ? {} : {}) }, null);
}
