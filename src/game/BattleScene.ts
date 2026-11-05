import Phaser from 'phaser';
import { inRange } from '../core/battle';
import type { Battle, Direction, Point, Pokemon, Shot } from '../core/battle';

const TILE_W = 78;
const TILE_H = 64;
const ORIGIN = { x: 130, y: 104 };
const DIRECTIONS: Record<Direction, number> = { east: 0, south: 90, west: 180, north: 270 };

/** 타일 좌표를 살짝 기울어진 전술 맵의 화면 좌표로 변환합니다. */
function screen(point: Point, raised = false): Point {
  return { x: ORIGIN.x + point.x * TILE_W + point.y * 15, y: ORIGIN.y + point.y * TILE_H - (raised ? 15 : 0) };
}
function color(value: string): number { return Number.parseInt(value.slice(1), 16); }

export class BattleScene extends Phaser.Scene {
  selectedPokemon: Pokemon | null = null;
  selectedUnit: number | null = null;
  paused = false;
  speed = 1;
  placementActive = false;
  placementTile: Point | null = null;
  placementDirection: Direction | null = null;
  private accumulator = 0;
  private hover: Point | null = null;
  private overlay!: Phaser.GameObjects.Graphics;
  private actors!: Phaser.GameObjects.Graphics;
  private preview!: Phaser.GameObjects.Graphics;
  private labels = new Map<number, Phaser.GameObjects.Text>();
  private effects: (Shot & { life: number })[] = [];

  constructor(private readonly getBattle: () => Battle, private readonly onTile: (x: number, y: number) => void,
    private readonly onRefresh: () => void) { super('battle'); }

  create(): void {
    // 논리 전장(1200×600)을 유지하면서 화면 크기만 변경합니다. 입력 좌표도 카메라가 역변환합니다.
    const fitCamera = (): void => {
      const { width, height } = this.scale.gameSize;
      this.cameras.main.setSize(width, height);
      this.cameras.main.setZoom(Math.min(width / 1200, height / 600));
      this.cameras.main.centerOn(600, 300);
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, fitCamera);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, fitCamera));
    fitCamera();
    const battle = this.getBattle();
    const terrain = this.add.graphics();
    // 배경 눈금은 장식이며 전투 판정과는 관계없습니다.
    terrain.lineStyle(1, 0x23303a, 0.25);
    for (let x = 0; x < 1200; x += 40) terrain.lineBetween(x, 0, x, 600);
    for (let y = 0; y < 600; y += 40) terrain.lineBetween(0, y, 1200, y);
    this.add.text(42, 24, 'TRAINING FIELD  /  SECTOR 01', { fontSize: '12px', color: '#72858b', letterSpacing: 2 });
    this.add.text(42, 557, 'N ↗   /   지상 · 높은 타일 분리', { fontSize: '12px', color: '#8a9b9e' });
    battle.stage.tiles.forEach((row, y) => [...row].forEach((tile, x) => {
      if (tile === ' ') return;
      const p = screen({ x, y }, tile === '#');
      const path = battle.stage.route.some(point => point.x === x && point.y === y);
      terrain.fillStyle(0x0b1218);
      terrain.fillPoints(this.diamond(p.x, p.y + 12), true);
      terrain.fillStyle(tile === '#' ? 0x56636b : path ? 0x39434a : 0x303b43);
      terrain.fillPoints(this.diamond(p.x, p.y), true);
      terrain.lineStyle(1, tile === '#' ? 0x7b898c : 0x59666b, 0.7);
      terrain.strokePoints(this.diamond(p.x, p.y), true);
      if (tile === '#') {
        terrain.lineStyle(2, 0x85908d, 0.45);
        terrain.lineBetween(p.x - 23, p.y + 17, p.x + 18, p.y + 17);
      }
      if (tile === 'S' || tile === 'E') {
        const tint = tile === 'S' ? 0xef755d : 0x78d6ed;
        terrain.lineStyle(3, tint);
        terrain.strokeRect(p.x - 26, p.y - 22, 50, 44);
        this.add.text(p.x, p.y, tile === 'S' ? '>>' : '⌂', { fontSize: '28px', color: tile === 'S' ? '#ef755d' : '#78d6ed' }).setOrigin(0.5);
      }
      this.add.text(p.x - 27, p.y - 24, `${x + 1}.${y + 1}`, { fontSize: '8px', color: '#b0bec2' }).setAlpha(0.35);
      // 입력 영역도 높은 타일의 화면 높이를 따릅니다. 판정에는 원래 타일 좌표를 전달합니다.
      this.add.zone(p.x, p.y, 72, 56).setInteractive({ useHandCursor: true })
        .on('pointerover', () => { this.hover = { x, y }; })
        .on('pointerout', () => { this.hover = null; })
        .on('pointerdown', () => this.onTile(x, y));
    }));
    // 경로는 점선으로 표시하고, 지형 입력을 가리지 않게 그래픽만 추가합니다.
    terrain.lineStyle(2, 0xe8ba75, 0.25);
    for (let i = 0; i < battle.stage.route.length - 1; i++) {
      const from = battle.stage.route[i]; const to = battle.stage.route[i + 1];
      if (!from || !to) continue;
      for (let step = 0; step < 4; step += 2) {
        const a = screen({ x: from.x + (to.x - from.x) * step / 4, y: from.y + (to.y - from.y) * step / 4 });
        const b = screen({ x: from.x + (to.x - from.x) * (step + 1) / 4, y: from.y + (to.y - from.y) * (step + 1) / 4 });
        terrain.lineBetween(a.x, a.y, b.x, b.y);
      }
    }
    this.overlay = this.add.graphics();
    this.actors = this.add.graphics();
    this.preview = this.add.graphics();
    this.onRefresh();
  }

  private diamond(x: number, y: number): Phaser.Geom.Point[] {
    return [new Phaser.Geom.Point(x - 43, y - 30), new Phaser.Geom.Point(x + 31, y - 30),
      new Phaser.Geom.Point(x + 45, y + 28), new Phaser.Geom.Point(x - 29, y + 28)];
  }

  /** HTML Pointer Events의 CSS 좌표를 현재 카메라의 논리 좌표로 바꿔 타일을 찾습니다. */
  tileAtClient(clientX: number, clientY: number): Point | null {
    if (!this.sys.isActive()) return null;
    const rect = this.game.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    const world = this.cameras.main.getWorldPoint((clientX - rect.left) * this.scale.width / rect.width,
      (clientY - rect.top) * this.scale.height / rect.height);
    const rows = this.getBattle().stage.tiles;
    // 위에 그려진 면부터 검사합니다. 높은 타일도 화면에 보이는 다각형 그대로 판정합니다.
    for (let y = rows.length - 1; y >= 0; y--) {
      const row = rows[y];
      if (!row) continue;
      for (let x = row.length - 1; x >= 0; x--) {
        if (row[x] === ' ') continue;
        const p = screen({ x, y }, row[x] === '#');
        if (Phaser.Geom.Polygon.Contains(new Phaser.Geom.Polygon(this.diamond(p.x, p.y)), world.x, world.y)) return { x, y };
      }
    }
    return null;
  }

  tileClientPosition(tile: Point): Point | null {
    if (!this.sys.isActive()) return null;
    const camera = this.cameras.main;
    const rect = this.game.canvas.getBoundingClientRect();
    const p = screen(tile, this.getBattle().stage.tiles[tile.y]?.[tile.x] === '#');
    // 카메라는 회전 없이 논리 전장 중심(600,300)을 바라봅니다. HTML 방향 UI도 같은 배율을 사용합니다.
    return { x: rect.left + (camera.width / 2 + (p.x - 600) * camera.zoom) * rect.width / this.scale.width,
      y: rect.top + (camera.height / 2 + (p.y - 300) * camera.zoom) * rect.height / this.scale.height };
  }

  clearBattle(): void {
    this.accumulator = 0; this.effects = []; this.selectedUnit = null;
    this.selectedPokemon = null; this.paused = false;
    this.placementActive = false; this.placementTile = null; this.placementDirection = null;
    this.labels.forEach(label => label.destroy()); this.labels.clear();
  }

  update(_time: number, delta: number): void {
    const battle = this.getBattle();
    // 고정 1/30초 틱: 렌더링 FPS가 달라도 동일한 전투 순서를 유지합니다.
    // 탭 복귀 시 누적 시간이 폭주하지 않도록 한 프레임 시간을 제한합니다.
    // 조작용 슬로모션은 기존 배속을 덮어쓰지 않습니다. 취소/완료 시 원래 배속으로 복귀합니다.
    const rate = this.placementActive ? 0.1 : this.speed;
    if (!this.paused && battle.status === 'running') this.accumulator += Math.min(delta / 1000, 0.25) * rate;
    while (this.accumulator >= 1 / 30) {
      battle.step(1 / 30);
      this.effects.push(...battle.shots.map(shot => ({ ...shot, life: 0.18 })));
      this.accumulator -= 1 / 30;
    }
    this.renderRange(battle);
    this.renderActors(battle);
    if (!this.paused) this.effects.forEach(effect => { effect.life -= delta / 1000 * rate; });
    this.effects = this.effects.filter(effect => effect.life > 0);
    for (const effect of this.effects) {
      const from = screen(effect.from, battle.stage.tiles[effect.from.y]?.[effect.from.x] === '#');
      const to = screen(effect.to);
      this.actors.lineStyle(3, color(effect.color), effect.life / 0.18);
      this.actors.lineBetween(from.x, from.y - 20, to.x, to.y - 15);
      this.actors.fillStyle(0xffffff, effect.life / 0.18).fillCircle(to.x, to.y - 15, 6);
    }
    this.onRefresh();
  }

  private renderRange(battle: Battle): void {
    this.overlay.clear();
    this.preview.clear();
    if (this.placementActive && this.selectedPokemon) {
      const selected = this.selectedPokemon;
      battle.stage.tiles.forEach((row, y) => [...row].forEach((tile, x) => {
        if (battle.deploymentError(selected, x, y)) return;
        const p = screen({ x, y }, tile === '#');
        this.overlay.fillStyle(0x8cdeae, 0.2).fillPoints(this.diamond(p.x, p.y), true);
        this.overlay.lineStyle(1, 0x8cdeae, 0.5).strokePoints(this.diamond(p.x, p.y), true);
      }));
      if (this.placementTile) {
        const p = screen(this.placementTile, battle.stage.tiles[this.placementTile.y]?.[this.placementTile.x] === '#');
        this.drawPokemon(p.x, p.y - 12, selected, this.preview);
        const valid = !battle.deploymentError(selected, this.placementTile.x, this.placementTile.y);
        this.preview.lineStyle(3, valid ? 0xa8e6bd : 0xed856f).strokePoints(this.diamond(p.x, p.y), true);
      }
    }
    const deployed = battle.units.find(unit => unit.id === this.selectedUnit);
    const pokemon = this.selectedPokemon ?? deployed?.pokemon;
    const origin = this.selectedPokemon ? this.placementTile ?? this.hover : deployed;
    const direction = this.selectedPokemon ? this.placementDirection : deployed?.direction;
    if (!pokemon || !origin || !direction) return;
    battle.stage.tiles.forEach((row, y) => [...row].forEach((tile, x) => {
      if (tile === ' ' || !inRange(origin, { x, y }, direction, pokemon.range, pokemon.width)) return;
      const p = screen({ x, y }, tile === '#');
      this.overlay.fillStyle(0xf3cc7b, 0.18).fillPoints(this.diamond(p.x, p.y), true);
      this.overlay.lineStyle(1, 0xf3cc7b, 0.4).strokePoints(this.diamond(p.x, p.y), true);
    }));
    if (this.selectedPokemon) {
      const p = screen(origin, battle.stage.tiles[origin.y]?.[origin.x] === '#');
      const valid = battle.deploymentError(pokemon, origin.x, origin.y) === null;
      this.overlay.lineStyle(3, valid ? 0x9ae0b8 : 0xed856f).strokePoints(this.diamond(p.x, p.y), true);
    }
  }

  private renderActors(battle: Battle): void {
    this.actors.clear();
    const alive = new Set<number>();
    for (const unit of battle.units) {
      alive.add(unit.id);
      const p = screen(unit, unit.pokemon.terrain === 'high');
      this.actors.fillStyle(0x000000, 0.35).fillEllipse(p.x, p.y + 9, 48, 19);
      if (unit.id === this.selectedUnit) this.actors.lineStyle(2, 0xffdf91).strokeEllipse(p.x, p.y + 7, 56, 25);
      this.drawPokemon(p.x, p.y - 12, unit.pokemon);
      const angle = Phaser.Math.DegToRad(DIRECTIONS[unit.direction]);
      const ax = p.x + Math.cos(angle) * 32; const ay = p.y + Math.sin(angle) * 24;
      this.actors.fillStyle(0xeef4e9).fillTriangle(ax + Math.cos(angle) * 8, ay + Math.sin(angle) * 8,
        ax + Math.cos(angle + 2.2) * 6, ay + Math.sin(angle + 2.2) * 6,
        ax + Math.cos(angle - 2.2) * 6, ay + Math.sin(angle - 2.2) * 6);
      this.healthBar(p.x, p.y + 22, unit.hp / unit.pokemon.hp, 0xa8dfb1);
      let label = this.labels.get(unit.id);
      if (!label) { label = this.add.text(0, 0, unit.pokemon.name, { fontSize: '11px', color: '#e9efeb', backgroundColor: '#17232bcc', padding: { x: 4, y: 2 } }).setOrigin(0.5); this.labels.set(unit.id, label); }
      label.setPosition(p.x, p.y + 40);
    }
    for (const enemy of battle.enemies) {
      const p = screen(enemy);
      this.actors.fillStyle(0x000000, 0.4).fillEllipse(p.x, p.y + 9, 33, 13);
      this.actors.fillStyle(0x956b87).fillCircle(p.x, p.y - 9, 16);
      this.actors.fillTriangle(p.x - 14, p.y - 17, p.x - 19, p.y - 30, p.x - 3, p.y - 22);
      this.actors.fillTriangle(p.x + 14, p.y - 17, p.x + 19, p.y - 30, p.x + 3, p.y - 22);
      this.actors.fillStyle(0xffd4b6).fillRect(p.x - 9, p.y - 13, 5, 4).fillRect(p.x + 4, p.y - 13, 5, 4);
      this.healthBar(p.x, p.y + 15, enemy.hp / battle.stage.enemy.hp, 0xeb866d);
    }
    this.labels.forEach((label, id) => { if (!alive.has(id)) { label.destroy(); this.labels.delete(id); } });
  }

  private healthBar(x: number, y: number, ratio: number, tint: number): void {
    this.actors.fillStyle(0x10191d).fillRect(x - 22, y, 44, 4);
    this.actors.fillStyle(tint).fillRect(x - 22, y, 44 * Math.max(0, ratio), 4);
  }

  /** 외부 IP 이미지 대신 디버깅용 도형 표식을 직접 그립니다. */
  private drawPokemon(x: number, y: number, pokemon: Pokemon, g = this.actors): void {
    g.fillStyle(color(pokemon.color));
    if (pokemon.id === 'pikachu') {
      g.fillTriangle(x - 15, y - 12, x - 19, y - 43, x - 4, y - 21);
      g.fillTriangle(x + 15, y - 12, x + 21, y - 40, x + 5, y - 20);
      g.fillCircle(x, y, 19);
      g.fillStyle(0xe57d63).fillCircle(x - 13, y + 5, 4).fillCircle(x + 13, y + 5, 4);
    } else if (pokemon.id === 'bulbasaur') {
      g.fillEllipse(x, y + 4, 44, 30);
      g.fillStyle(0x4e9668).fillTriangle(x - 18, y - 10, x + 1, y - 38, x + 20, y - 10);
      g.fillStyle(color(pokemon.color)).fillCircle(x - 3, y, 17);
    } else if (pokemon.id === 'charmander') {
      g.fillEllipse(x, y + 4, 28, 37).fillCircle(x, y - 12, 16);
      g.fillStyle(0xf6d17c).fillEllipse(x, y + 8, 15, 20);
      g.fillStyle(0xf2ba54).fillTriangle(x + 16, y + 14, x + 27, y - 15, x + 34, y + 14);
      g.fillStyle(0xec7357).fillCircle(x + 26, y + 9, 7);
    } else {
      g.fillStyle(0xb49d70).fillCircle(x + 9, y + 4, 20);
      g.lineStyle(2, 0xf3e0b0).strokeCircle(x + 9, y + 4, 20);
      g.fillStyle(color(pokemon.color)).fillCircle(x - 6, y - 11, 16).fillEllipse(x - 7, y + 10, 24, 22);
    }
    g.fillStyle(0x192a2c).fillCircle(x - 8, y - 5, 2.4).fillCircle(x + 5, y - 5, 2.4);
  }
}
