import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useLoad } from "@/lib/use-load";

afterEach(cleanup);

describe("useLoad", () => {
  test("has nothing until what it loads arrives", async () => {
    const load = vi.fn(async () => ["a", "b"]);

    const { result } = renderHook(() => useLoad(load));

    expect(result.current).toMatchObject({ data: undefined, failed: false });
    await waitFor(() => expect(result.current.data).toEqual(["a", "b"]));
    expect(load).toHaveBeenCalledTimes(1);
  });

  test("loads nothing while there is nothing to load", () => {
    const { result } = renderHook(() => useLoad<string>(null));

    expect(result.current).toMatchObject({ data: undefined, failed: false });
  });

  test("loads once there is something to load", async () => {
    const load = vi.fn(async () => "text");
    const { result, rerender } = renderHook(({ wanted }) => useLoad(wanted ? load : null), {
      initialProps: { wanted: false },
    });
    expect(load).not.toHaveBeenCalled();

    rerender({ wanted: true });

    await waitFor(() => expect(result.current.data).toBe("text"));
  });

  test("reports a failure with its reason, and loads again on request", async () => {
    const reason = new Error("offline");
    const load = vi.fn().mockRejectedValueOnce(reason).mockResolvedValue("text");
    const { result } = renderHook(() => useLoad<string>(load));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.error).toBe(reason);

    act(() => result.current.retry());

    expect(result.current).toMatchObject({ failed: false, error: undefined });
    await waitFor(() => expect(result.current.data).toBe("text"));
    expect(load).toHaveBeenCalledTimes(2);
  });

  test("counts a failure that comes with no reason", async () => {
    const { result } = renderHook(() => useLoad(() => Promise.reject(undefined)));

    await waitFor(() => expect(result.current.failed).toBe(true));
  });

  test("lets what was loaded be changed", async () => {
    const { result } = renderHook(() => useLoad(listOfTwo));
    await waitFor(() => expect(result.current.data).toHaveLength(2));

    act(() => result.current.setData(["b"]));

    expect(result.current.data).toEqual(["b"]);
  });

  test("ignores what arrives after the component has gone", async () => {
    let arrive: (text: string) => void = () => {};
    const load = () => new Promise<string>((resolve) => (arrive = resolve));
    const { result, unmount } = renderHook(() => useLoad(load));

    unmount();
    await act(async () => arrive("late"));

    expect(result.current.data).toBeUndefined();
  });
});

const listOfTwo = async () => ["a", "b"];
