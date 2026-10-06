import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ApiError, saveDocument, type SavedState, type SavedSummary } from "@/lib/api";
import { emptyDraft } from "@/lib/draft";
import { useAutosave } from "@/lib/use-autosave";

vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  saveDocument: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.mocked(saveDocument).mockReset();
});

/** A document after this many messages. */
function state(messages: number, document = "csa"): SavedState {
  return {
    draft: { ...emptyDraft(document), document },
    messages: Array.from({ length: messages }, (_, index) => ({
      role: index % 2 ? "assistant" : "user",
      content: `Message ${index + 1}`,
    })),
  };
}

const summary = (id: number): SavedSummary => ({ id, document: "csa", parties: "", updatedAt: "" });

/** Makes each save wait until the test lets it finish, in the order they were made. */
function holdSaves() {
  const held: { finish: (id: number) => void; fail: () => void }[] = [];
  vi.mocked(saveDocument).mockImplementation(
    () =>
      new Promise((resolve, reject) =>
        held.push({ finish: (id) => resolve(summary(id)), fail: () => reject(new Error("offline")) }),
      ),
  );
  return held;
}

const targets = () => vi.mocked(saveDocument).mock.calls.map(([id]) => id);

describe("useAutosave", () => {
  test("has nothing saved to begin with, unless the document was opened", () => {
    expect(renderHook(() => useAutosave(null)).result.current.status).toBe("unsaved");
    expect(renderHook(() => useAutosave(7)).result.current.status).toBe("saved");
  });

  test("saves a new document, then over it", async () => {
    vi.mocked(saveDocument).mockResolvedValue(summary(4));
    const onSaved = vi.fn();
    const { result } = renderHook(() => useAutosave(null, onSaved));

    act(() => result.current.save(state(2)));
    expect(result.current.status).toBe("saving");
    await waitFor(() => expect(result.current.status).toBe("saved"));
    act(() => result.current.save(state(4)));
    await waitFor(() => expect(saveDocument).toHaveBeenCalledTimes(2));

    expect(vi.mocked(saveDocument).mock.calls).toEqual([
      [null, state(2)],
      [4, state(4)],
    ]);
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(4);
  });

  test("saves over the document that was opened", async () => {
    vi.mocked(saveDocument).mockResolvedValue(summary(7));
    const onSaved = vi.fn();
    const { result } = renderHook(() => useAutosave(7, onSaved));

    act(() => result.current.save(state(4)));
    await waitFor(() => expect(result.current.status).toBe("saved"));

    expect(targets()).toEqual([7]);
    expect(onSaved).not.toHaveBeenCalled();
  });

  test("waits for one save to finish before starting the next", async () => {
    const held = holdSaves();
    const { result } = renderHook(() => useAutosave(null));

    act(() => result.current.save(state(2)));
    act(() => result.current.save(state(4)));
    await waitFor(() => expect(saveDocument).toHaveBeenCalledTimes(1));

    await act(async () => held[0].finish(4));
    await waitFor(() => expect(saveDocument).toHaveBeenCalledTimes(2));

    // The second save went to the id the first one came back with, not to another new document.
    expect(targets()).toEqual([null, 4]);
    expect(result.current.status).toBe("saving");
    await act(async () => held[1].finish(4));
    expect(result.current.status).toBe("saved");
  });

  test("saves another document as a new one, without disturbing a save of the first", async () => {
    const held = holdSaves();
    const onSaved = vi.fn();
    const { result } = renderHook(() => useAutosave(7, onSaved));

    act(() => result.current.save(state(2)));
    act(() => result.current.save(state(2, "psa"), true));
    await waitFor(() => expect(saveDocument).toHaveBeenCalledTimes(1));
    await act(async () => held[0].finish(7));
    await waitFor(() => expect(saveDocument).toHaveBeenCalledTimes(2));
    await act(async () => held[1].finish(8));
    act(() => result.current.save(state(4, "psa")));
    await waitFor(() => expect(saveDocument).toHaveBeenCalledTimes(3));

    expect(targets()).toEqual([7, null, 8]);
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(8);
  });

  test("says a save failed, and makes it again on request", async () => {
    const held = holdSaves();
    const { result } = renderHook(() => useAutosave(null));

    act(() => result.current.save(state(2)));
    await waitFor(() => expect(saveDocument).toHaveBeenCalledTimes(1));
    await act(async () => held[0].fail());
    expect(result.current.status).toBe("failed");

    act(() => result.current.retry());
    await waitFor(() => expect(saveDocument).toHaveBeenCalledTimes(2));
    await act(async () => held[1].finish(4));

    expect(result.current.status).toBe("saved");
    expect(vi.mocked(saveDocument).mock.calls).toEqual([
      [null, state(2)],
      [null, state(2)],
    ]);
  });

  test("goes on saving after a failure", async () => {
    vi.mocked(saveDocument).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(summary(4));
    const { result } = renderHook(() => useAutosave(null));

    act(() => result.current.save(state(2)));
    await waitFor(() => expect(result.current.status).toBe("failed"));
    act(() => result.current.save(state(4)));
    await waitFor(() => expect(result.current.status).toBe("saved"));

    expect(targets()).toEqual([null, null]);
  });

  test("does not call an earlier save the last word", async () => {
    const held = holdSaves();
    const { result } = renderHook(() => useAutosave(null));

    act(() => result.current.save(state(2)));
    act(() => result.current.save(state(4)));
    await waitFor(() => expect(saveDocument).toHaveBeenCalledTimes(1));
    await act(async () => held[0].fail());

    expect(result.current.status).toBe("saving");
  });

  test("has nothing to try again before anything was saved", () => {
    const { result } = renderHook(() => useAutosave(null));

    act(() => result.current.retry());

    expect(saveDocument).not.toHaveBeenCalled();
  });

  test("keeps the end of a conversation that is longer than the backend will take", async () => {
    vi.mocked(saveDocument).mockResolvedValue(summary(4));
    const { result } = renderHook(() => useAutosave(null));

    act(() => result.current.save(state(204)));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());

    const { messages } = vi.mocked(saveDocument).mock.calls[0][1];
    expect(messages).toHaveLength(200);
    expect([messages[0].content, messages[199].content]).toEqual(["Message 5", "Message 204"]);
  });

  test("saves a document afresh when the one it was saved as has been deleted", async () => {
    vi.mocked(saveDocument)
      .mockRejectedValueOnce(new ApiError("This document doesn’t exist or has been deleted.", 404))
      .mockResolvedValue(summary(9));
    const onSaved = vi.fn();
    const { result } = renderHook(() => useAutosave(7, onSaved));

    act(() => result.current.save(state(4)));
    await waitFor(() => expect(result.current.status).toBe("saved"));
    act(() => result.current.save(state(6)));
    await waitFor(() => expect(saveDocument).toHaveBeenCalledTimes(3));

    expect(targets()).toEqual([7, null, 9]);
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(9);
  });

  test.each([
    ["the backend fails", new ApiError("Something went wrong.", 500)],
    ["the backend cannot be reached", new TypeError("Failed to fetch")],
  ])("does not save a second copy when %s", async (_, failure) => {
    vi.mocked(saveDocument).mockRejectedValue(failure);
    const { result } = renderHook(() => useAutosave(7));

    act(() => result.current.save(state(4)));
    await waitFor(() => expect(result.current.status).toBe("failed"));

    expect(targets()).toEqual([7]);
  });

  test("finishes a save after the user has left, without telling anyone its id", async () => {
    const held = holdSaves();
    const onSaved = vi.fn();
    const { result, unmount } = renderHook(() => useAutosave(null, onSaved));
    act(() => result.current.save(state(2)));
    await waitFor(() => expect(saveDocument).toHaveBeenCalledTimes(1));

    unmount();
    await act(async () => held[0].finish(4));

    // Whoever was listening would have put the id in the address of another page.
    expect(onSaved).not.toHaveBeenCalled();
  });
});
