import type { AbilityId } from './data/abilities';
import type { ChapterId, EnemyType } from './levels/types';

export type SimEvent =
  | { t: 'jump' }
  | { t: 'land'; speed: number }
  | { t: 'swing'; combo: number }
  | { t: 'hit'; enemy: string; type: EnemyType; x: number; y: number; z: number; heavy: boolean; immune: boolean }
  | { t: 'enemyDown'; enemy: string; type: EnemyType; x: number; y: number; z: number }
  | { t: 'telegraph'; enemy: string; type: EnemyType }
  | { t: 'enemyAttack'; enemy: string; type: EnemyType }
  | { t: 'hurt'; hp: number }
  | { t: 'dash' }
  | { t: 'dashDenied'; reason: string }
  | { t: 'jumpDenied'; reason: string }
  | { t: 'attackDenied'; reason: string }
  | { t: 'perfect'; x: number; y: number; z: number }
  | { t: 'pickup'; value: number; repaid: number }
  | { t: 'fall' }
  | { t: 'dead' }
  | { t: 'respawn' }
  | { t: 'lantern'; on: boolean }
  | { t: 'lanternDenied'; reason: string }
  | { t: 'dialog'; script: string }
  | { t: 'shop'; shrine: string }
  | { t: 'checkpoint'; shrine: string }
  | { t: 'lawChanged'; ability: AbilityId; pawned: boolean }
  | { t: 'exit'; to: ChapterId | 'ending' }
  | { t: 'floatRise' }
  | { t: 'gateOpen'; id: string }
  | { t: 'windBlown'; enemy: string }
  | { t: 'hazardHit'; id: string; kind: 'blade' | 'rock' };
