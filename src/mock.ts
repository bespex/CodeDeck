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
  file("CLAUDE.md", 2400),
  file("IDEAS.md", 640),
  file("README.md", 780),
  file("ROADMAP.md", 1900),
  file("TODO.md", 520),
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
  { id: "docs", kind: "folder", label: "docs/", detail: "", count: { files: 2, truncated: false }, tokens: 4230 }, // sample data, as the backend would count
];

/** The planning files of the sample project (Workbench, Plan). */
export const plan: import("./backend").Plan = {
  roadmap: {
    path: "ROADMAP.md",
    title: "Rate limits for every client",
    goal: "Every client has its own limit, and the docs say how to change it.",
    asOf: "2026-11-27",
    later: 2,
    stages: [
      { id: "M1", title: "Limiter in the middleware", state: "done", goal: null, line: 8, steps: [] },
      {
        id: "M2",
        title: "Limits per client",
        state: "active",
        goal: "Each client gets its own limit from the config.",
        line: 13,
        steps: [
          { text: "Read limits from the config", line: 18, state: "done" },
          { text: "Tests for the limiter", line: 19, state: "active" },
          { text: "Per-client limits in the order routes", line: 20, state: "open" },
          { text: "Error message with the reset time", line: 21, state: "open" },
        ],
      },
      { id: "M3", title: "Documentation", state: "open", goal: null, line: 26, steps: [{ text: "Write docs/limits.md", line: 31, state: "open" }] },
      {
        id: "U1",
        title: "Metrics for the limiter",
        state: "active",
        goal: null,
        line: 34,
        steps: [
          { text: "Built 2026-11-25: counters per client", line: 38, state: "done" },
          { text: "Practical test: counters show in the dashboard", line: 39, state: "open" },
        ],
      },
      { id: "U2", title: "Burst allowance", state: "active", goal: null, line: 43, steps: [{ text: "Let a client exceed its limit for 2 s", line: 47, state: "open" }] },
    ],
  },
  tasks: {
    path: "TODO.md",
    questions: [{ text: "Should limits apply to internal clients?", line: 5, state: "open" }],
    tasks: [
      { text: "Rename RateLimit to Limiter", line: 9, state: "open" },
      { text: "Remove the old throttle module", line: 10, state: "open" },
      { text: "Move the limits table from the README into docs/limits.md and link it from the config comments", line: 11, state: "open" },
      { text: "Log a warning when a client hits 80 % of its limit", line: 12, state: "open" },
    ],
  },
  ideas: {
    path: "IDEAS.md",
    ideas: [
      { text: "Limits per endpoint", line: 5, state: "open" },
      { text: "A dashboard of who is limited", line: 8, state: "open" },
      { text: "Limits that follow the time of day", line: 11, state: "open" },
      { text: "Let a client ask for its remaining quota", line: 14, state: "open" },
    ],
  },
};
