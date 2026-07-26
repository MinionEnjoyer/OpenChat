/**
 * Shared helper for mutation-invalidation tests.
 *
 * Usage pattern:
 *   const result = await runInvalidationTest((qc) => ({
 *     label: 'useCreateChannel',
 *     mutationFn: (input) => api.request(...),
 *     onSuccess: () => { qc.invalidateQueries(...); },
 *     expectedQueryKey: ['channels', serverId],  // FROM THE READ SIDE
 *     input: { name: 'general' },
 *   }));
 *   expect(result.invalidated).toBe(true);
 *
 * The expected queryKey MUST be derived from the READ side (the hook/component
 * that displays the data), NOT from the mutation code you are testing.
 */
import { QueryClient } from '@tanstack/react-query';

export interface MutationInvalidationTest {
  /** Human-readable label for this mutation (e.g. "useDeleteChannel") */
  label: string;
  /** The mutation function (same as the hook's mutationFn) */
  mutationFn: (input: unknown) => Promise<unknown>;
  /** The onSuccess callback (same as the hook's onSuccess).
   *  Use the `qc` parameter from the factory — IT is the spied instance. */
  onSuccess: () => void;
  /** The expected query key — FROM THE READ SIDE */
  expectedQueryKey: readonly string[];
  /** Input to pass to mutationFn */
  input: unknown;
}

export interface TestResult {
  label: string;
  expectedKey: readonly string[];
  invalidated: boolean;
  actualCalls: { queryKey?: unknown }[];
  error?: string;
}

/**
 * Run one invalidation test. Returns a TestResult.
 *
 * The factory receives the spied QueryClient — use IT in your onSuccess
 * closure, not a separate instance.
 *
 * Mocks api.request IS the caller's responsibility (jest.mock before import).
 */
export async function runInvalidationTest(
  factory: (qc: QueryClient) => MutationInvalidationTest,
): Promise<TestResult> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');

  const t = factory(qc);

  try {
    await t.mutationFn(t.input);
    t.onSuccess();
  } catch (e) {
    return {
      label: t.label,
      expectedKey: t.expectedQueryKey,
      invalidated: false,
      actualCalls: invalidateSpy.mock.calls.map((c) => c[0] as Record<string, unknown>),
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const calls = invalidateSpy.mock.calls.map((c) => c[0] as Record<string, unknown>);

  const matched = calls.some((c) => {
    const qk = c?.queryKey as readonly string[] | undefined;
    if (!qk) return false;
    if (qk.length !== t.expectedQueryKey.length) return false;
    return qk.every((seg, i) => seg === t.expectedQueryKey[i]);
  });

  return {
    label: t.label,
    expectedKey: t.expectedQueryKey,
    invalidated: matched,
    actualCalls: calls,
  };
}
