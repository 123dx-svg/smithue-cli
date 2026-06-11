# Changelog

## v0.9.0 — Portfile Robustness

### Fixed
- **Portfile not deleted on timeout**: `checkLiveness` now returns without unlinking when the probe times out (AbortError). Only deletes when process is confirmed dead AND endpoint unreachable simultaneously.
- **Error message taxonomy**: `AbortError` (including when message contains "fetch failed") is now correctly classified as "timed out" — checked before connection-error patterns.

### Added
- `SMITHUE_PROBE_TIMEOUT` env var controls liveness probe timeout (default: 10000ms, was hardcoded 3000ms)
- `src/proc.ts`: `isProcessAlive(pid)` utility using `process.kill(pid, 0)` for pid liveness check
- Backward compatible with old plugins (no plugin_version, no heartbeat endpoint)

---

## v0.8.0

Initial public release with core CLI commands: `exec`, `list`, `search`, `status`, `batch`, `upgrade`, `prune`, `purge`.
