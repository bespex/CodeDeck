// Static sample data for the UI shell (Phase 2). Everything in here is replaced by the
// Rust backend in later phases: the file tree in Phase 3, the trail in Phase 5.

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

export interface Pin {
  id: string;
  kind: "file" | "folder" | "snippet";
  label: string;
  detail: string;
  tokens: number;
  /** Tool that sent the pin through the socket, if any */
  via?: string;
}

export interface TrailEntry {
  id: string;
  title: string;
  author: "ai" | "you";
  when: string;
  files: number;
  /** Uncommitted working tree */
  live?: boolean;
}

export interface ChatMessage {
  id: string;
  from: "you" | "assistant";
  text: string;
  /** Files the assistant changed in this turn */
  changed?: string[];
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

export const trail: TrailEntry[] = [
  { id: "live", title: "Working tree", author: "ai", when: "now", files: 5, live: true },
  { id: "a41f9c2", title: "Add rate limit middleware", author: "ai", when: "4 min ago", files: 3 },
  { id: "7be02d1", title: "Wire limiter into orders route", author: "ai", when: "11 min ago", files: 2 },
  { id: "c93a7f0", title: "Tighten config defaults", author: "you", when: "38 min ago", files: 1 },
  { id: "1d5e8ab", title: "Extract order validation", author: "ai", when: "1 h ago", files: 4 },
  { id: "f0273c6", title: "Bump axum to 0.8", author: "you", when: "yesterday", files: 2 },
  { id: "88ac410", title: "Initial project layout", author: "you", when: "2 days ago", files: 14 },
];

export const initialChat: ChatMessage[] = [
  {
    id: "m1",
    from: "you",
    text: "Add a per-client rate limit to the orders endpoint. 60 requests a minute, configurable.",
  },
  {
    id: "m2",
    from: "assistant",
    text: "Done. The limiter is a token bucket keyed by API client; the limit comes from `rate_limit.per_minute` in the config and defaults to 60. I added a test that exhausts the bucket and checks for 429.",
    changed: ["src/middleware/rate_limit.rs", "src/routes/orders.rs", "tests/rate_limit.rs"],
  },
  {
    id: "m3",
    from: "you",
    text: "Held orders in the fixture should not count against the limit.",
  },
];

export const configToml = `[project]
name = "orbit-api"

[assistant]
provider = "claude-cli"
model = "claude-sonnet-5-5"
context_budget = 200000

[tools]
"*.json" = "jayq"
"*.xml"  = "xaq"
"*.md"   = "marq"

[files]
ignore = ["target", "node_modules"]
`;

/** What the parser would make of `configToml`. */
export const config = {
  assistant: { provider: "Claude CLI", model: "claude-sonnet-5-5", contextBudget: 200_000 },
  tools: [
    { pattern: "*.json", tool: "jayq", what: "JSON viewer with jq filter", found: true },
    { pattern: "*.xml", tool: "xaq", what: "XML viewer with XSLT view", found: true },
    { pattern: "*.md", tool: "marq", what: "Markdown viewer", found: false },
  ],
  ignore: ["target", "node_modules"],
};
