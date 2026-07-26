/**
 * Shared helper for mutation-invalidation tests that exercise real hooks.
 *
 * Renders a hook inside a QueryClientProvider with a spied QueryClient,
 * calls mutateAsync, and checks that invalidateQueries was called with the
 * expected read-side query key.
 */
import React from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import renderer, { act } from 'react-test-renderer';

export interface TestResult {
  label: string;
  expectedKey: readonly string[];
  invalidated: boolean;
  actualCalls: { queryKey?: unknown }[];
  error?: string;
}

/**
 * Render a mutation hook, call mutateAsync, and verify invalidation.
 *
 * @param label       Human-readable label for this test
 * @param useHook     Factory that calls the hook (must follow rules of hooks)
 * @param input       Input passed to mutateAsync
 * @param expectedQueryKey Read-side query key the mutation must invalidate
 */
export async function runInvalidationTest<TData = unknown, TVariables = unknown>(
  label: string,
  useHook: () => UseMutationResult<TData, Error, TVariables>,
  input: TVariables,
  expectedQueryKey: readonly string[],
): Promise<TestResult> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');

  // Store the mutation result so the test can call mutateAsync on it.
  const ref: { current: UseMutationResult<TData, Error, TVariables> | null } = { current: null };

  function Harness(): React.JSX.Element {
    const mutation = useHook();
    ref.current = mutation;
    return React.createElement(React.Fragment, null);
  }

  let root: renderer.ReactTestRenderer;
  act(() => {
    root = renderer.create(
      React.createElement(QueryClientProvider, { client: qc },
        React.createElement(Harness),
      ),
    );
  });

  const mutation = ref.current;
  if (!mutation) {
    return {
      label,
      expectedKey: expectedQueryKey,
      invalidated: false,
      actualCalls: [],
      error: 'Hook did not return a mutation result',
    };
  }

  try {
    await mutation.mutateAsync(input);
  } catch (e) {
    return {
      label,
      expectedKey: expectedQueryKey,
      invalidated: false,
      actualCalls: invalidateSpy.mock.calls.map((c) => c[0] as Record<string, unknown>),
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const calls = invalidateSpy.mock.calls.map((c) => c[0] as Record<string, unknown>);

  const matched = calls.some((c) => {
    const qk = c?.queryKey as readonly string[] | undefined;
    if (!qk) return false;
    if (qk.length !== expectedQueryKey.length) return false;
    return qk.every((seg, i) => seg === expectedQueryKey[i]);
  });

  return {
    label,
    expectedKey: expectedQueryKey,
    invalidated: matched,
    actualCalls: calls,
  };
}
