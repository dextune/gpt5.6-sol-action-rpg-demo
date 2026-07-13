# 01 — Horde infrastructure: fodder tier, pack spawn, performance budget (P0)

## Current state (evidence)

### Density numbers
- Hunt: `GAME_CONFIG.targetEnemies = 28`, `maxEnemies = 42`, spawn radius 18–46, world radius 172 (`js/config.js`).
  → Spread across a large map; real fights are 2–4 enemies. Long downtime walking to find packs.
- Defense: `DEFENSE_CONFIG.baseCount = 5`, `countPerThreeWaves = 1`, `maxCount = 36` (`js/config.js`).
  → Only ~35 enemies by wave 90. Midgame never feels like a true rush.
- Horde-clear genre baseline is **60–150+ on screen**. Cap 42 cannot sell the fantasy.

### Cost per enemy (why density cannot rise)
- One enemy = full skinned GLB clone. `MonsterFactory.create()` builds a **new StylizedMaterial per mesh** (`js/characters/MonsterFactory.js` traverse).
- After the 2026-07 detail pass, meshes per monster: slime 9, hare 15, boar 16, humanoid 16, colossus 21 (glTF).
  → 36 enemies × ~15 meshes ≈ **540+ draw calls** (outlines and health-bar billboards extra).
- Health bars show for all within 8m (`Enemy.#animate`: `playerDistance < 8`).
- Only LOD0/LOD1. No ultra-cheap fodder LOD.
- Skinned bone matrix updates + per-enemy `CharacterAnimationController`.

### Spawn pattern
- Solo wander spawns (`EnemySystem`) — no pack concept for coordinated rushes.

## Design proposal

### A. Three-tier render budget

| Tier | Role | Rendering | Target cost |
|---|---|---|---|
| **Fodder** | ~90% of the horde. Dies in 1–3 hits | Single merged mesh (detail parts baked or omitted), **shared material** per archetype, no outline, no HP bar (show only 2s after hit) | 1–2 draw calls each |
| **Veteran** | Current normal mob slot; elites included | Keep current LOD0/LOD1 | 5–10 each |
| **Boss** | Boss / miniboss | Full detail + dedicated FX | Uncapped |

Implementation notes:
- Generator (`tools/assets/generate_assets.mjs`): add `_lod2` output — `mergeGeometries` including detail parts, one material (vertex color for regions), half marching-cubes resolution.
- Shared materials break per-instance `hitPulse` → fodder hit flash via **squash + hit starburst** (already present), or instance color if InstancedMesh lands later.
- Ideally `InstancedMesh` + baked bone animation textures (VAT). Phase 1 target is merged mesh + shared material for ~2–3× density.

### B. Density / spawn targets

- Hunt: `targetEnemies 28→60`, `maxEnemies 42→90` (fodder ~70% of population via spawn weights).
- Defense: `baseCount 5→10`, `countPerThreeWaves 1→2`, `maxCount 36→80`. Lower per-enemy HP so total TTK stays similar.
- **Pack spawn**: fodder spawn as 4–8 clusters from one origin + ground-ring telegraph (0.6s), then rush the player. Add `EnemySystem.spawnPack(type, count, origin)`.
- Fodder stats: HP 30–40% of normal, XP 25–35%. Baseline feel: 3–4 fodder per basic swing.

### C. Performance guardrails

- Health bars: fodder hidden (2s after hit); veteran unchanged.
- `Enemy.update` skinned animation: distant fodder (>35m) frame-skip (1/2, 1/4 rate).
- Cap kill-FX storms on multi-death frames — pair with [02-kill-reward-loop.md](02-kill-reward-loop.md) multikill coalesce.
- Metrics: desktop 90 enemies + skill FX at 60fps; mobile preset fodder cap ~55.

## Acceptance criteria

1. Hunt field holds 50+ enemies in view without frame collapse.
2. Fodder packs approach as groups (not only solo wanderers).
3. Basic attack regularly kills 3+ fodder in one swing, several times per minute.
4. `renderer.info.render.calls` ≤ 300 at 90 enemies.
