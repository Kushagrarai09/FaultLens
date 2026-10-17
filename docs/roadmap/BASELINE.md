# FaultLens Baseline Audit

> Complete this during Phase 0 before implementation changes.

## Environment
- OS:
- Node.js version:
- pnpm version:
- Docker version (if used):

## Install
Command:
Result:
Notes:

## Infrastructure
- [ ] PostgreSQL starts and is reachable
- [ ] Redis starts and is reachable
- [ ] Migrations run successfully
- [ ] Required environment variables are documented
- [ ] Secrets are not committed

## Apps
### Web
Command:
Result:
Current working paths:
Known issues:

### API
Command:
Result:
Health endpoint:
Current routes:
Known issues:

### Worker
Command:
Result:
Queue connection:
Current jobs:
Known issues:

## Quality checks
- [ ] Install passes
- [ ] Lint passes
- [ ] Type-check passes
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Build passes

Record existing failures verbatim and distinguish them from changes introduced later.

## Current functionality
| Capability | Exists? | Evidence / file or route | Gap |
| --- | --- | --- | --- |
| API health | | | |
| Persist AI run | | | |
| List run history | | | |
| Run detail | | | |
| Provider integration | | | |
| Token usage | | | |
| Cost estimation | | | |
| Prompt versioning | | | |
| Evaluation dataset | | | |
| OpenTelemetry | | | |

## First vertical slice
A developer submits or triggers one synthetic AI run; the API validates it, persistence stores safe metadata, and the dashboard lists it and opens details.

## Commands used
Paste exact commands and outcomes here.

## Phase 0 exit decision
- [ ] All required apps start locally, or blockers are documented with reproduction steps
- [ ] Existing behavior is recorded
- [ ] First thin vertical slice is chosen
- [ ] No premature rewrite or infrastructure expansion
