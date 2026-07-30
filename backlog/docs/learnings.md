# Learnings

- Keep `.vscodeignore` in sync when adding new root-level tooling dirs (e.g. `.claude/`, `backlog/`) — otherwise they get bundled into the packaged `.vsix`. (TASK-1)
- `npm test` downloads a VS Code/Electron test host over the network; it times out in sandboxed/offline environments. Fall back to the build gate (`check-types` + `lint`, both already run by `npm run package`) per the release skill, and note the skip rather than blocking. (TASK-1)
