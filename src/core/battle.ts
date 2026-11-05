/** 화면 좌표가 아닌 타일 단위 좌표. 경로 이동 중에는 소수점을 허용합니다. */
export interface Point { x: number; y: number }
export type Direction = 'east' | 'south' | 'west' | 'north';
export type Terrain = 'ground' | 'high';
export interface Pokemon {
  id: string; name: string; role: string; element: string; color: string;
  terrain: Terrain; cost: number; hp: number; attack: number;
  interval: number; range: number; width: number; block: number;
}
export interface Stage {
  name: string; subtitle: string; tiles: string[]; route: Point[];
  initialCost: number; maxCost: number; costPerSecond: number; life: number;
  deployLimit: number;
  enemy: { count: number; spawnInterval: number; hp: number; speed: number; attack: number; interval: number };
}
export interface Unit extends Point { id: number; pokemon: Pokemon; direction: Direction; hp: number; cooldown: number }
export interface Enemy extends Point { id: number; progress: number; hp: number; cooldown: number }
export interface Shot { from: Point; to: Point; color: string }
export type BattleStatus = 'ready' | 'running' | 'won' | 'lost';

/** 전방 직사각형 공격 범위. 방향 변환은 렌더링과 독립적으로 계산합니다. */
export function inRange(origin: Point, target: Point, direction: Direction, range: number, width: number): boolean {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const forward = direction === 'east' ? dx : direction === 'west' ? -dx : direction === 'south' ? dy : -dy;
  const side = direction === 'east' || direction === 'west' ? dy : dx;
  // 배치 타일과 전방 range칸을 포함합니다. 소수 좌표의 적도 경계까지 판정합니다.
  return forward >= -0.45 && forward <= range + 0.45 && Math.abs(side) <= width + 0.45;
}

/** Phaser/DOM 없이 실행되는 전투 상태. 모든 시간은 초 단위입니다. */
export class Battle {
  status: BattleStatus = 'ready';
  cost: number;
  life: number;
  elapsed = 0;
  spawned = 0;
  defeated = 0;
  leaked = 0;
  units: Unit[] = [];
  enemies: Enemy[] = [];
  shots: Shot[] = [];
  private spawnClock = 0;
  private nextId = 1;

  constructor(readonly stage: Stage, readonly roster: readonly Pokemon[]) {
    this.cost = stage.initialCost;
    this.life = stage.life;
  }

  start(): void { if (this.status === 'ready') this.status = 'running'; }

  deploymentError(pokemon: Pokemon, x: number, y: number): string | null {
    if (this.status === 'won' || this.status === 'lost') return '종료된 전투입니다. 다시 시작해 주세요.';
    if (!Number.isInteger(x) || !Number.isInteger(y)) return '타일을 선택해 주세요.';
    const tile = this.stage.tiles[y]?.[x];
    if (tile !== (pokemon.terrain === 'ground' ? '.' : '#')) return pokemon.terrain === 'ground' ? '지상 타일에 배치할 수 있습니다.' : '높은 타일에 배치할 수 있습니다.';
    if (this.units.some(unit => unit.x === x && unit.y === y)) return '이미 배치된 타일입니다.';
    if (this.units.some(unit => unit.pokemon.id === pokemon.id)) return '이미 전장에 있는 포켓몬입니다.';
    if (this.units.length >= this.stage.deployLimit) return '배치 가능 수를 초과했습니다.';
    if (this.cost < pokemon.cost) return '배치 코스트가 부족합니다.';
    return null;
  }

  deploy(pokemonId: string, x: number, y: number, direction: Direction): string | null {
    const pokemon = this.roster.find(item => item.id === pokemonId);
    if (!pokemon) return '포켓몬 데이터가 없습니다.';
    const error = this.deploymentError(pokemon, x, y);
    if (error) return error;
    this.cost -= pokemon.cost;
    this.units.push({ id: this.nextId++, pokemon, x, y, direction, hp: pokemon.hp, cooldown: 0 });
    return null;
  }

  retreat(id: number): void {
    // 임시 규칙: 철수는 코스트를 반환하지 않으며, 다시 코스트를 지불하면 재배치합니다.
    if (this.status === 'won' || this.status === 'lost') return;
    this.units = this.units.filter(unit => unit.id !== id);
  }

  step(dt: number): void {
    this.shots = [];
    if (this.status !== 'running' || !Number.isFinite(dt) || dt <= 0) return;
    this.elapsed += dt;
    this.cost = Math.min(this.stage.maxCost, this.cost + dt * this.stage.costPerSecond);
    this.spawnClock -= dt;
    if (this.spawned < this.stage.enemy.count && this.spawnClock <= 0) {
      const entry = this.stage.route[0];
      if (entry) this.enemies.push({ id: this.nextId++, ...entry, progress: 0, hp: this.stage.enemy.hp, cooldown: 0 });
      this.spawned++;
      this.spawnClock += this.stage.enemy.spawnInterval;
    }

    // 먼저 방어선 가까운 적부터 처리하므로 저지 대상 선택이 매 틱 결정적입니다.
    this.enemies.sort((a, b) => b.progress - a.progress);
    const blocked = new Map<number, number>();
    for (const enemy of this.enemies) {
      enemy.cooldown = Math.max(0, enemy.cooldown - dt);
      const blocker = this.units.find(unit => unit.hp > 0 && unit.pokemon.block > (blocked.get(unit.id) ?? 0)
        && Math.hypot(unit.x - enemy.x, unit.y - enemy.y) < 0.58);
      if (blocker) {
        blocked.set(blocker.id, (blocked.get(blocker.id) ?? 0) + 1);
        if (enemy.cooldown <= 0) {
          blocker.hp -= this.stage.enemy.attack;
          enemy.cooldown = this.stage.enemy.interval;
        }
      } else {
        enemy.progress += this.stage.enemy.speed * dt;
        const index = Math.floor(enemy.progress);
        const from = this.stage.route[index];
        const to = this.stage.route[index + 1];
        if (from && to) {
          const ratio = enemy.progress - index;
          enemy.x = from.x + (to.x - from.x) * ratio;
          enemy.y = from.y + (to.y - from.y) * ratio;
        }
      }
    }
    this.units = this.units.filter(unit => unit.hp > 0);
    for (const unit of this.units) {
      unit.cooldown = Math.max(0, unit.cooldown - dt);
      const target = this.enemies.find(enemy => enemy.hp > 0 && enemy.progress < this.stage.route.length - 1
        && inRange(unit, enemy, unit.direction, unit.pokemon.range, unit.pokemon.width));
      if (target && unit.cooldown <= 0) {
        target.hp -= unit.pokemon.attack;
        unit.cooldown = unit.pokemon.interval;
        this.shots.push({ from: { x: unit.x, y: unit.y }, to: { x: target.x, y: target.y }, color: unit.pokemon.color });
      }
    }
    // 공격 후 사망/도착을 한 번만 정산합니다. 방어 수치는 음수로 내려가지 않습니다.
    this.enemies = this.enemies.filter(enemy => {
      if (enemy.hp <= 0) { this.defeated++; return false; }
      if (enemy.progress >= this.stage.route.length - 1) {
        this.leaked++; this.life = Math.max(0, this.life - 1); return false;
      }
      return true;
    });
    if (this.life === 0) this.status = 'lost';
    else if (this.spawned === this.stage.enemy.count && this.enemies.length === 0) this.status = 'won';
  }
}
