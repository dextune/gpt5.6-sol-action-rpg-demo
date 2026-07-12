# 01 — 물량 인프라: 잡몹 티어, 팩 스폰, 성능 예산 (P0)

## 현재 상태 (증거)

### 밀도 수치
- Hunt: `GAME_CONFIG.targetEnemies = 28`, `maxEnemies = 42`, 스폰 반경 18~46, 월드 반경 172 (`js/config.js`).
  → 넓은 맵에 흩뿌려져 실제 교전은 2~4마리 단위. 적을 찾아 걷는 다운타임이 길다.
- Defense: `DEFENSE_CONFIG.baseCount = 5`, `countPerThreeWaves = 1`, `maxCount = 36` (`js/config.js`).
  → 웨이브 90은 되어야 35마리. "몰려온다"는 압박이 초중반에 없다.
- 물량 격파 장르의 기준은 **화면당 60~150+**. 상한 42로는 판타지가 성립하지 않는다.

### 마리당 비용 (밀도를 못 올리는 구조적 원인)
- 적 1마리 = 풀 스킨드 GLB 클론. `MonsterFactory.create()`가 **모든 메시에 새 StylizedMaterial 인스턴스**를 생성 (`js/characters/MonsterFactory.js` traverse 루프).
- 2026-07 디테일 패스 이후 몬스터당 메시 수: slime 9, hare 15, boar 16, humanoid 16, colossus 21 (glTF 기준).
  → 36마리 × 15메시 ≈ **드로우콜 540+** (아웃라인, 헬스바 빌보드 별도).
- 헬스바가 8m 이내 전부 표시 (`Enemy.#animate`: `playerDistance < 8`).
- LOD0/LOD1 두 단계뿐. 잡몹 전용 초경량 LOD가 없다.
- 스킨드 메시 본 행렬 갱신 + `CharacterAnimationController`가 마리당 개별 실행.

### 스폰 방식
- 개별 배회 스폰(`EnemySystem`) — 무리 지어 몰려오는 "팩" 개념이 없다.

## 설계 제안

### A. 몬스터 3-티어 렌더링 예산

| 티어 | 용도 | 렌더링 | 목표 비용 |
|---|---|---|---|
| **Fodder(잡몹)** | 물량의 90%. 1~3대에 죽는 적 | 단일 병합 메시(디테일 파츠 베이크 or 생략), 아키타입당 **공유 머티리얼**, 아웃라인 생략, 헬스바 생략(피격 후 2초만 표시) | 마리당 드로우콜 1~2 |
| **Veteran(정예)** | 현 일반몹 포지션. 엘리트 포함 | 현행 LOD0/LOD1 유지 | 마리당 5~10 |
| **Boss** | 보스/미니보스 | 현행 풀 디테일 + 전용 연출 | 제한 없음 |

구현 노트:
- 생성기(`tools/assets/generate_assets.mjs`)에 `_lod2` 출력 추가: `mergeGeometries`로 디테일 파츠까지 한 메시로 병합, 머티리얼 1개(버텍스 컬러로 색 영역 구분), 마칭큐브 해상도 절반.
- 공유 머티리얼 시 개별 `hitPulse`가 문제 → 잡몹 피격 플래시는 머티리얼 대신 **스쿼시 + 히트 스타버스트**(이미 있음)로 대체하거나, InstancedMesh 도입 시 인스턴스 컬러로 처리.
- 가능하면 `InstancedMesh` + 베이크드 본 애니메이션 텍스처(VAT)까지. 단, 1차 목표는 병합 메시 + 공유 머티리얼만으로도 충분히 밀도 2~3배.

### B. 밀도/스폰 튜닝 목표치

- Hunt: `targetEnemies 28→60`, `maxEnemies 42→90` (fodder가 정원의 70%를 차지하도록 스폰 가중치).
- Defense: `baseCount 5→10`, `countPerThreeWaves 1→2`, `maxCount 36→80`. HP 곡선은 물량 증가분만큼 마리당 하향(총 TTK 유지).
- **팩 스폰**: 잡몹은 4~8마리 클러스터로 한 지점에서 동시 스폰 + 등장 텔레그래프(바닥 링 0.6초) 후 플레이어 방향으로 무리 이동. `EnemySystem`에 `spawnPack(type, count, origin)` 추가.
- 잡몹 스탯: HP는 일반몹의 30~40%, XP는 25~35%. "한 스윙에 3~4마리"가 기본 체감이 되도록.

### C. 성능 가드레일

- 헬스바: fodder는 미표시(피격 후 2초), veteran은 현행 유지.
- `Enemy.update`의 스킨 애니메이션: 원거리(>35m) fodder는 애니메이션 프레임 스킵(1/2, 1/4 rate).
- 동시 사망 프레임에 킬 이펙트 폭주 방지 — [02-kill-reward-loop.md](02-kill-reward-loop.md)의 "다중 킬 통합 연출"과 연동.
- 측정 기준: 데스크톱 기준 90마리 + 스킬 연출 동시 발동에서 60fps, 모바일 프리셋에서 fodder 상한 55.

## 수용 기준 (완료 정의)

1. Hunt 필드에서 상시 50마리 이상이 시야 내에 존재하고 프레임이 유지된다.
2. 잡몹 팩이 무리 지어 접근하는 것이 보인다(개별 배회가 아니라).
3. 기본 공격 1스윙으로 잡몹 3마리 이상이 동시에 죽는 상황이 분당 수차례 발생한다.
4. `renderer.info.render.calls`가 90마리 기준 300 이하.
