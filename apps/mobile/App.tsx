import { HelloScreen } from './src/features/hello';

/**
 * Root component. Navigation (React Navigation v7 per 06 §1) arrives with the
 * app shell in P1-06; until then the skeleton mounts its single screen directly.
 */
export default function App(): React.JSX.Element {
  return <HelloScreen />;
}
