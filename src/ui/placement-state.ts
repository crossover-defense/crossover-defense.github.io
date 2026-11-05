import type { Direction, Point } from '../core/battle.js';

export interface PlacementIntent { pokemonId: string; tile: Point; direction: Direction }

/** 예약은 실제 전투 유닛이 아닙니다. 방향 확정 전에는 코스트/배치 수를 변경하지 않습니다. */
export class PlacementState {
  phase: 'idle' | 'dragging' | 'direction' = 'idle';
  pokemonId: string | null = null;
  tile: Point | null = null;
  direction: Direction | null = null;

  get active(): boolean { return this.phase !== 'idle'; }

  begin(pokemonId: string): void {
    this.cancel();
    this.pokemonId = pokemonId;
    this.phase = 'dragging';
  }

  move(tile: Point | null): void {
    if (this.phase === 'dragging') this.tile = tile ? { ...tile } : null;
  }

  reserve(): boolean {
    if (this.phase !== 'dragging' || !this.tile) return false;
    this.phase = 'direction';
    this.direction = null;
    return true;
  }

  aim(dx: number, dy: number): void {
    if (this.phase !== 'direction') return;
    // CSS 픽셀 기준 데드존: 손떨림이나 중앙 탭만으로 배치가 확정되는 것을 막습니다.
    this.direction = Math.hypot(dx, dy) < 22 ? null
      : Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'east' : 'west') : (dy >= 0 ? 'south' : 'north');
  }

  intent(): PlacementIntent | null {
    if (this.phase !== 'direction' || !this.pokemonId || !this.tile || !this.direction) return null;
    return { pokemonId: this.pokemonId, tile: { ...this.tile }, direction: this.direction };
  }

  cancel(): void {
    this.phase = 'idle'; this.pokemonId = null; this.tile = null; this.direction = null;
  }
}
