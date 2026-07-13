# Shared Growth and Skill-Tree System

## 1. Progression model

Active skill growth has three separate axes so level 100 does not become raw multiplier inflation.

### Core rank

- Raise active skills from maximum rank 5 to maximum rank 10.
- Ranks tune damage, radius, resource cost efficiency, status potency, and cooldown within explicit caps.
- A rank must not silently replace milestone behavior.
- Prefer roughly 8–12% total-output growth per rank before build synergies.

### Automatic forms

- Level 20, 60, and 100 forms unlock automatically when the skill itself is unlocked.
- Forms change animation, timing, hit count, trajectory, or finisher structure.
- Automatic forms ensure every character visibly evolves even when skill points are distributed differently.

### Mutation choices

- Level 40 and 80 offer one of two mutually exclusive mutations per active skill.
- Level 40 generally selects coverage/tempo versus concentrated force.
- Level 80 generally selects chain/control versus elite/boss execution.
- Mutation choices never change the key or remove the direct attack.
- Respec should occur from the skill panel and should not require a new combat binding.

## 2. Level-100 point economy

Recommended budget:

| Spend | Maximum |
|---|---:|
| Four active skills, ranks 2–10 | 36 points |
| Existing passive families | 45 points |
| Optional class keystones | 12–16 points |
| Flexible remainder | 2–6 points |

Automatic forms and mutation choices should not consume ordinary rank points. This keeps the existing point economy understandable and prevents a player from missing the visual evolution system.

## 3. Passive-tree upgrade (post-release proposal)

The shipped active-skill release keeps the five passive lanes and implements one Level 100 offensive keystone per class. The additional Level 25, 50, and 75 rows below are a post-release proposal, not shipped acceptance criteria. If implemented later, each keystone must create an observable combat event.

| Level | Keystone role |
|---|---|
| 25 | Basic-combo identity trigger |
| 50 | Status/resource interaction |
| 75 | Skill-to-skill combo payoff |
| 100 | Class capstone tied to the Apex forms |

Pure loot or defense passives may remain, but the capstone path must affect attacks, motion cadence, or hit reactions.

## 4. Proposed content schema

The existing `SKILLS` row remains the source of truth. Additive fields avoid rewriting current handlers in one pass.

```js
{
  maxRank: 10,
  evolution: {
    forms: {
      20: { combat: {}, presentation: {}, timeline: {}, anim: '...' },
      60: { combat: {}, presentation: {}, timeline: {}, anim: '...' },
      100: { combat: {}, presentation: {}, timeline: {}, anim: '...' },
    },
    mutations: {
      40: {
        coverage: { combat: {}, presentation: {} },
        focus: { combat: {}, presentation: {} },
      },
      80: {
        chain: { combat: {}, presentation: {} },
        execution: { combat: {}, presentation: {} },
      },
    },
  },
}
```

Add a pure resolver such as `resolveSkillForm(skill, rank, playerLevel, choices)` that returns a merged, immutable runtime bundle. Combat handlers should consume the resolved bundle rather than branch repeatedly on player level.

## 5. Save compatibility

Keep existing skill ranks and merge defaults for the new choices.

```js
skillEvolution: {
  whirlwind: { tier40: 'coverage', tier80: 'chain' },
}
```

Rules:

- Missing `skillEvolution` loads as an empty object.
- Automatic forms derive from player level and are not serialized.
- Invalid mutation IDs fall back to the first documented option.
- Do not change `saveKey` or `saveVersion` unless a migration is genuinely required.
- Temporary statuses and skill phases are never persisted.

## 6. Balance guardrails

- Area mutations trade single-target output for coverage; they do not grant both for free.
- Boss mutations must not trivialize ordinary packs with the same multiplier.
- Hard crowd control uses diminishing duration by enemy category.
- A multi-hit skill is balanced by total expected output, not per-hit headline damage.
- Attack-speed buffs must obey animation and input cadence caps.
- Level 100 Apex forms may be visually large but should remain readable at medium quality.

Recommended crowd-control response:

| Enemy | Pull | Stun/freeze |
|---|---|---|
| Normal | Full displacement | 1.8–2.4 seconds |
| Elite | Reduced displacement | 0.8–1.2 seconds |
| Boss | Visual tug only | Stagger-meter damage instead |

## 7. UI behavior

- Keep four skill cards and the existing HUD slots.
- Show form milestones as a vertical level track inside each card.
- Show level 40 and 80 mutations as two compact selectable nodes.
- The HUD icon displays only the selected mutation badge and current form border.
- Tooltips compare current and next behavior using numbers from the resolved combat data.
- Locked forms show their required level without adding new player-facing key instructions.
