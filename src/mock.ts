// Sample data for the browser preview (`npx vite`, no Tauri backend).

import type { Pin } from "./files";

/** `M` modified, `A` added, `D` deleted, `R` renamed, `U` conflict, `?` untracked */
export type GitState = "M" | "A" | "D" | "R" | "U" | "?";

export interface FileNode {
  name: string;
  path: string;
  children?: FileNode[];
  /** Recently modified by the AI */
  ai?: boolean;
  git?: GitState;
  /** Rough token estimate, shown when the file is pinned */
  tokens?: number;
}

const dir = (path: string, children: FileNode[]): FileNode => ({
  name: path.split("/").pop()!,
  path,
  children,
});

const file = (path: string, tokens: number, extra: Partial<FileNode> = {}): FileNode => ({
  name: path.split("/").pop()!,
  path,
  tokens,
  ...extra,
});

export const project = {
  name: "orbit-api",
  root: "~/projects/orbit-api",
  branch: "feature/rate-limit",
  socket: "/run/user/1000/codedeck/orbit-api.sock",
};

export const tree: FileNode[] = [
  dir("src", [
    dir("src/routes", [
      file("src/routes/mod.rs", 420),
      file("src/routes/orders.rs", 2130, { ai: true, git: "M" }),
      file("src/routes/users.rs", 1780),
    ]),
    dir("src/middleware", [
      file("src/middleware/auth.rs", 1240),
      file("src/middleware/rate_limit.rs", 960, { ai: true, git: "A" }),
    ]),
    file("src/config.rs", 640, { git: "M" }),
    file("src/main.rs", 510),
  ]),
  dir("tests", [
    file("tests/orders.rs", 1490),
    file("tests/rate_limit.rs", 720, { ai: true, git: "A" }),
  ]),
  dir("fixtures", [
    file("fixtures/orders.json", 3900),
    file("fixtures/feed.xml", 2650),
  ]),
  dir("docs", [file("docs/architecture.md", 1820), file("docs/api.md", 2410)]),
  file(".codedeck.toml", 90),
  file("Cargo.toml", 310, { git: "M" }),
  file("README.md", 780),
];

export const initialPins: Pin[] = [
  {
    id: "src/middleware/rate_limit.rs",
    kind: "file",
    label: "rate_limit.rs",
    detail: "src/middleware",
    tokens: 960,
  },
  {
    id: "src/routes/orders.rs",
    kind: "file",
    label: "orders.rs",
    detail: "src/routes",
    tokens: 2130,
  },
  {
    id: "snippet-1",
    kind: "snippet",
    label: ".orders[] | select(.status == \"held\")",
    detail: "fixtures/orders.json",
    tokens: 340,
    via: "jayq",
  },
  { id: "docs", kind: "folder", label: "docs/", detail: "2 files", tokens: 4230 },
];
