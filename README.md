# Traffic Lights Simulation — Smart 4‑Way Intersection (Fullstack)

A fullstack simulation of a 4‑way road intersection with configurable traffic‑light controllers (fixed‑cycle and adaptive).  
The project is structured as a reusable simulation engine with multiple interfaces: CLI, HTTP API, and a web UI with step replay and an SVG intersection view.

---

## Contents

- [Key capabilities](#key-capabilities)
- [Architecture](#architecture)
- [JSON contract](#json-contract)
- [Simulation model](#simulation-model)
- [Traffic-light phases (conflict-free)](#traffic-light-phases-conflict-free)
- [`step` semantics](#step-semantics)
- [Controllers](#controllers)
- [Realistic switching (YELLOW / ALL_RED)](#realistic-switching-yellow--all_red)
- [Diagnostics](#diagnostics)
- [How to run](#how-to-run)
- [Benchmark / scenario generator](#benchmark--scenario-generator)
- [Testing](#testing)
- [Determinism & performance notes](#determinism--performance-notes)
- [Packaging as git bundle](#packaging-as-git-bundle)

---

## Key capabilities

- 4 approaches: `north`, `south`, `east`, `west`
- Per-approach lane queues: `left`, `through`, `right`
- Conflict-free phase set including protected left turns
- Two controller modes:
  - `fixed` (cycle-based with gap-out / skipping empty phases)
  - `adaptive` (pressure-based with stability + fairness constraints)
- Optional realistic clearance stages during switching (`YELLOW`, `ALL_RED`)
- Diagnostics trace and aggregated statistics (used by the UI for replay)
- Web UI:
  - run simulation from JSON input
  - replay with slider + play/pause
  - SVG visualization of the intersection for the selected step
- CLI runner: **one command** `input.json → output.json`
- Benchmark tool: scenario generator + fixed vs adaptive comparison

---

## Architecture

Monorepo (npm workspaces) with a strict separation of concerns:

```
packages/
  shared-types/     # JSON contract + validation (Zod), shared types
  sim-core/         # simulation engine (pure logic, no I/O)
apps/
  cli/              # CLI runner (input.json -> output.json)
  api/              # Fastify server (POST /simulate)
  web/              # React + Vite UI (replay + SVG)
  tools/            # benchmark / scenario generator
```

**Design rule:** the simulation engine (`sim-core`) does not depend on HTTP, filesystem, or UI.  
All I/O is handled by `apps/*`, which makes the core highly testable and reusable.

---

## JSON contract

### Input: `commands[]`

Two command types (in order):

- `addVehicle`
  - adds a vehicle to the `startRoad` approach
  - `endRoad` determines the turn (`right`, `straight`, `left`) and thus the lane queue
- `step`
  - advances the simulation by one step
  - the controller may switch phases and/or discharge vehicles (depending on stage)

Example:

```json
{
  "commands": [
    { "type": "addVehicle", "vehicleId": "vehicle1", "startRoad": "south", "endRoad": "north" },
    { "type": "step" }
  ]
}
```

### Output: required format

The CLI and the API (without diagnostics) return the required output format:

```json
{
  "stepStatuses": [
    { "leftVehicles": ["vehicle1"] }
  ]
}
```

- `stepStatuses` has one entry per `step` command
- `leftVehicles` lists vehicle IDs that left the intersection in that step

---

## Simulation model

### Approaches and lane queues

Each approach has three logical lane queues:

- `left`  (left turns)
- `through` (straight)
- `right` (right turns)

Vehicles are placed into one of these queues based on the computed maneuver from `(startRoad -> endRoad)`.

### Turn derivation

From `(startRoad -> endRoad)` the maneuver is derived as:

- `right`, `straight`, or `left`
- U‑turns (`startRoad == endRoad`) are rejected as invalid input

### Discharge model (throughput)

If the active stage is `GREEN`, vehicles are discharged from the currently allowed lanes:

- up to `throughputPerLanePerStep` vehicles per allowed lane (default `1`)
- output order is deterministic (stable insertion order)

This model is deliberately simple, deterministic, and easy to test while still representing lane-based demand.

---

## Traffic-light phases (conflict-free)

A single active green phase is selected from the following set:

1. `NS_THROUGH`: north + south allow `through + right`
2. `EW_THROUGH`: east + west allow `through + right`
3. `NS_LEFT`: north + south allow `left` (protected left turns)
4. `EW_LEFT`: east + west allow `left`

This phase design prevents conflicting greens by construction.

---

## `step` semantics

For a single `step`:

1) the controller decides whether to keep the current phase or switch (subject to controller rules)  
2) if the current stage is `GREEN`, vehicles are discharged from allowed lane queues  
3) the step returns `leftVehicles[]`

If the current stage is `YELLOW` or `ALL_RED`, **no vehicles are discharged** in that step.

---

## Controllers

The engine provides two traffic-light control strategies.

### Fixed mode (cycle + gap-out)

- cycles through phases in a fixed order
- can skip phases with zero demand (`skipPhasesWithZeroDemand`)
- can “gap-out” quickly when current phase has no demand (avoid wasting green time)
- switching is guided by `greenStepsPerPhase`

Use case: deterministic baseline controller.

### Adaptive mode (pressure-based, actuated / max-pressure inspired)

The controller evaluates each phase using a pressure score computed from queues and waiting times.

Definitions for a given phase:

- `queueSum`: number of vehicles in the phase’s allowed lane queues
- `waitSum`: sum of waiting times (in steps) for vehicles in those queues

Score:

```
score = wQ * queueSum + wW * waitSum
```

Where `wQ` and `wW` are configurable weights (`pressureWeights.queue`, `pressureWeights.wait`).

Stability and fairness constraints:

- `minGreenSteps`: prevents rapid phase toggling
- `maxGreenSteps`: bounds maximum green duration (avoids starving others)
- `switchHysteresis`: switch only if best phase is sufficiently better than current
- `starvationThresholdSteps` + `starvationBonus`: fairness guard (forces priority when maximum waiting time grows too large)

This balances throughput and fairness under varying demand.

---

## Realistic switching (YELLOW / ALL_RED)

Switching can insert clearance stages:

- `YELLOW` for `yellowSteps` steps
- `ALL_RED` for `allRedSteps` steps

During clearance stages the engine discharges **no vehicles**, so `leftVehicles` can be `[]` for those steps.  
This means short scenarios (few `step`s) may not discharge all vehicles if switching consumes some steps.

---

## Diagnostics

When diagnostics are enabled (API query `diagnostics=1` or UI toggle), the API returns:

- `output`: the required output format
- `trace[]`: per-step trace including:
  - `signal` (stage/phase info)
  - `queueSizesBefore` / `queueSizesAfter`
  - `leftVehicles`
- `stats`: aggregated metrics (e.g., average wait, max queue, total vehicles discharged)

The web UI uses diagnostics for replay and visualization.

---

## How to run

### Install
```bash
npm install
```

### Quality gate (format + lint + build + test)
```bash
npm run check
```

### CLI (single command: input → output)
```bash
npm run sim -- input.json output.json
```

Realistic switching enabled:
```bash
npm run sim:realistic -- input.json output.json
```

### API
Terminal:
```bash
npm run dev:api
```

Endpoints:
- `GET /health`
- `POST /simulate`

Examples:
```bash
curl -s http://localhost:3000/health

curl -s -X POST "http://localhost:3000/simulate" \
  -H "content-type: application/json" \
  --data-binary @examples/sample-input.json
```

Parameters:
- `mode=fixed|adaptive`
- `diagnostics=1`
- `yellowSteps=<int>`
- `allRedSteps=<int>`

Example (adaptive + diagnostics + realistic):
```bash
curl -s -X POST "http://localhost:3000/simulate?mode=adaptive&diagnostics=1&yellowSteps=1&allRedSteps=1" \
  -H "content-type: application/json" \
  --data-binary @examples/sample-input.json
```

### Web UI
Run API + Web in two terminals:

Terminal 1:
```bash
npm run dev:api
```

Terminal 2:
```bash
npm run dev:web
```

Open:
- http://localhost:5173

---

## Benchmark / scenario generator

A utility generates a randomized traffic scenario and compares fixed vs adaptive using diagnostics stats.

```bash
npm run bench -- --steps 400 --seed 7 --p 0.25
```

Options:
- `--steps <int>` number of steps
- `--seed <int>` RNG seed
- `--p <0..1>` arrival probability per road per step
- `--outScenario <file>` writes the generated scenario JSON

---

## Testing

```bash
npm run test
```

Test coverage includes:
- required output format and reference scenario behavior
- adaptive behavior in high-demand situations
- diagnostics wrapper consistency
- realistic switching producing clearance (no-discharge) steps

---

## Determinism & performance notes

- The simulation engine is deterministic for a given command sequence and config.
- Queue operations are simple and bounded by throughput per step, which is sufficient for typical workloads.
- Randomness appears only in the benchmark/scenario generator.

---
