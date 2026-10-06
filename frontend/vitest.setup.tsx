import type { ComponentProps } from "react";
import { vi } from "vitest";

// A plain link: following one is the router's business, which the tests leave out.
vi.mock("next/link", () => ({
  default: ({ href, ...rest }: ComponentProps<"a">) => <a href={href} {...rest} />,
}));
