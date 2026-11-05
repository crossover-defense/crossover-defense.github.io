import Phaser from 'phaser';
import { Battle } from './core/battle';
import type { Direction, Pokemon, Stage } from './core/battle';
import { BattleScene } from './game/BattleScene';
import { bindDisplay } from './ui/display';
import pokemonData from './data/pokemon.json';
import stageData from './data/stage.json';
import './style.css';

// 로컬 JSON의 타입 계약을 검사합니다. 서버/에디터 입력을 도입할 때는 런타임 검증을 추가합니다.
const roster: Pokemon[] = pokemonData.map(item => {
  if (item.terrain !== 'high' && item.terrain !== 'ground') throw new Error('잘못된 배치 지형');
  return { ...item, terrain: item.terrain };
});
const stage: Stage = stageData;
let battle = new Battle(stage, roster);
function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`필수 UI 누락: ${id}`);
  return node as T;
}
const status = element('status');
const cards = new Map<string, HTMLButtonElement>();
let lastUi = '';

const scene = new BattleScene(() => battle, (x, y) => {
  if (scene.selectedPokemon) {
    const name = scene.selectedPokemon.name;
    const error = battle.deploy(scene.selectedPokemon.id, x, y, scene.direction);
    status.textContent = error ?? `${name} 배치 완료 · 배치된 포켓몬을 선택하면 범위 확인과 철수가 가능합니다.`;
    if (!error) { scene.selectedPokemon = null; scene.selectedUnit = battle.units.at(-1)?.id ?? null; }
  } else {
    const unit = battle.units.find(item => item.x === x && item.y === y);
    scene.selectedUnit = unit?.id ?? null;
    status.textContent = unit ? `${unit.pokemon.name} 선택 · 철수 시 코스트는 반환되지 않습니다.` : '배치할 포켓몬을 아래에서 선택하세요.';
  }
  refresh();
}, refresh);

// SVG는 자체 제작한 임시 표식입니다. 공식 이미지/네트워크 의존성 없이 동작합니다.
function portrait(id: string, tint: string): string {
  const extra = id === 'pikachu'
    ? '<path d="M35 45L27 6 48 36M64 42L80 7 72 49" fill="currentColor" stroke="#1d292c" stroke-width="3"/><path d="M78 72L95 54 88 48 103 30" fill="none" stroke="currentColor" stroke-width="9"/>'
    : id === 'bulbasaur' ? '<path d="M18 61Q12 24 51 8Q87 20 83 59" fill="#438164"/><path d="M51 8L48 56" stroke="#80b58a" stroke-width="3"/>'
    : id === 'charmander' ? '<path d="M74 83Q101 74 90 57" fill="none" stroke="currentColor" stroke-width="12"/><path d="M84 59L89 30 101 57 94 67Z" fill="#f6c25f"/>'
    : '<ellipse cx="66" cy="65" rx="30" ry="26" fill="#a08d6b" stroke="#e5d5aa" stroke-width="4"/>';
  return `<svg viewBox="0 0 112 104" aria-hidden="true" style="color:${tint}">${extra}<ellipse cx="53" cy="79" rx="25" ry="20" fill="currentColor"/><circle cx="51" cy="53" r="26" fill="currentColor"/><circle cx="41" cy="50" r="3" fill="#1d292c"/><circle cx="62" cy="50" r="3" fill="#1d292c"/><path d="M47 61Q52 65 57 61" fill="none" stroke="#1d292c" stroke-width="2"/>${id === 'pikachu' ? '<circle cx="32" cy="60" r="5" fill="#d67e65"/><circle cx="71" cy="60" r="5" fill="#d67e65"/>' : ''}</svg>`;
}
for (const pokemon of roster) {
  const button = document.createElement('button');
  button.className = 'pokemon-card';
  button.style.setProperty('--pokemon-color', pokemon.color);
  button.setAttribute('aria-label', `${pokemon.name}, ${pokemon.role}, 코스트 ${pokemon.cost}`);
  button.innerHTML = `<div class="card-top"><span>${pokemon.element}</span><strong>${pokemon.cost}<small> DP</small></strong></div><div class="portrait">${portrait(pokemon.id, pokemon.color)}</div><div class="card-name"><strong>${pokemon.name}</strong><span>${pokemon.role}</span></div><span class="card-state">선택 가능</span>`;
  button.addEventListener('click', () => {
    scene.selectedPokemon = scene.selectedPokemon?.id === pokemon.id ? null : pokemon;
    scene.selectedUnit = null;
    status.textContent = scene.selectedPokemon ? `${pokemon.name} 선택 · 방향을 고르고 ${pokemon.terrain === 'high' ? '높은' : '지상'} 타일을 누르세요. 노란 영역은 공격 범위입니다.` : '선택을 해제했습니다.';
    refresh();
  });
  element('roster').append(button); cards.set(pokemon.id, button);
}

function refresh(): void {
  // 상태가 변했을 때만 DOM을 갱신해 Phaser의 매 프레임 렌더링과 비용을 분리합니다.
  const key = [battle.status, Math.floor(battle.cost), battle.life, battle.defeated, battle.leaked,
    Math.floor(battle.elapsed), battle.units.map(unit => `${unit.id}:${Math.ceil(unit.hp)}`).join(','),
    scene.selectedPokemon?.id, scene.selectedUnit, scene.direction, scene.paused, scene.speed].join('|');
  if (key === lastUi) return;
  lastUi = key;
  element('life').textContent = String(battle.life);
  element('enemies').textContent = `${battle.defeated + battle.leaked} / ${stage.enemy.count}`;
  element('enemies').title = `격파 ${battle.defeated} · 통과 ${battle.leaked}`;
  element('time').textContent = `${String(Math.floor(battle.elapsed / 60)).padStart(2, '0')}:${String(Math.floor(battle.elapsed % 60)).padStart(2, '0')}`;
  element('cost').textContent = String(Math.floor(battle.cost));
  element('slots').textContent = `${battle.units.length} / ${stage.deployLimit}`;
  element('speed').textContent = `${scene.speed}×`;
  element('pause').textContent = scene.paused ? '계속 진행' : '일시정지';
  element<HTMLButtonElement>('pause').disabled = battle.status !== 'running';
  const deployed = battle.units.find(unit => unit.id === scene.selectedUnit);
  const selection = scene.selectedPokemon ?? deployed?.pokemon;
  element('selection-name').textContent = selection?.name ?? '포켓몬을 선택하세요';
  element('selection-detail').textContent = selection
    ? `${selection.terrain === 'high' ? '높은 타일' : '지상 타일'} · 공격 ${selection.attack} / ${selection.interval}초 · 전방 ${selection.range}칸 · 체력 ${deployed ? Math.ceil(deployed.hp) : selection.hp}${deployed ? ` / ${selection.hp}` : ''}`
    : '높은 타일에는 원거리, 지상에는 저지 유닛을 배치할 수 있습니다.';
  element('retreat').hidden = !deployed || battle.status === 'won' || battle.status === 'lost';
  document.querySelectorAll<HTMLButtonElement>('[data-direction]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.direction === scene.direction));
    button.disabled = !!deployed;
  });
  for (const pokemon of roster) {
    const card = cards.get(pokemon.id);
    if (!card) continue;
    const isDeployed = battle.units.some(unit => unit.pokemon.id === pokemon.id);
    card.disabled = isDeployed || battle.cost < pokemon.cost || battle.status === 'won' || battle.status === 'lost';
    card.setAttribute('aria-pressed', String(scene.selectedPokemon?.id === pokemon.id));
    const label = card.querySelector('.card-state');
    if (label) label.textContent = isDeployed ? '배치 중' : battle.cost < pokemon.cost ? '코스트 부족' : '선택 가능';
  }
  const overlay = element('battle-overlay');
  overlay.hidden = battle.status === 'running';
  overlay.classList.toggle('ready', battle.status === 'ready');
  const won = battle.status === 'won';
  element('overlay-tag').textContent = battle.status === 'ready' ? 'OPERATION READY' : won ? 'MISSION COMPLETE' : 'MISSION FAILED';
  element('overlay-title').textContent = battle.status === 'ready' ? '방어선을 구축하세요' : won ? '작전 성공' : '방어선 돌파';
  element('overlay-description').textContent = battle.status === 'ready' ? '미리 배치하거나 시작 후 배치할 수 있습니다.' : `격파 ${battle.defeated} · 통과 ${battle.leaked} · 남은 방어 수치 ${battle.life}`;
  element('start').textContent = battle.status === 'ready' ? '작전 시작 →' : '다시 도전 →';
}
function reset(): void {
  battle = new Battle(stage, roster); scene.clearBattle(); lastUi = '';
  status.textContent = '초기 상태로 돌아왔습니다. 포켓몬을 배치하고 작전을 시작하세요.';
  refresh();
}
element('start').addEventListener('click', () => {
  if (battle.status !== 'ready') reset();
  else { battle.start(); status.textContent = '작전 진행 중 · 배치된 유닛을 선택하면 공격 범위를 확인할 수 있습니다.'; refresh(); }
});
element('pause').addEventListener('click', () => { scene.paused = !scene.paused; refresh(); });
element('speed').addEventListener('click', () => { scene.speed = scene.speed === 1 ? 2 : 1; refresh(); });
element('restart').addEventListener('click', reset);
element('retreat').addEventListener('click', () => {
  if (scene.selectedUnit !== null) battle.retreat(scene.selectedUnit);
  scene.selectedUnit = null; status.textContent = '철수했습니다. 코스트는 반환되지 않습니다.'; refresh();
});
element('cancel').addEventListener('click', () => { scene.selectedPokemon = null; scene.selectedUnit = null; refresh(); });
document.querySelectorAll<HTMLButtonElement>('[data-direction]').forEach(button => button.addEventListener('click', () => {
  const direction = button.dataset.direction;
  if (direction === 'east' || direction === 'west' || direction === 'south' || direction === 'north') scene.direction = direction satisfies Direction;
  refresh();
}));

const game = new Phaser.Game({
  type: Phaser.AUTO, parent: 'game', backgroundColor: '#18232c',
  // Canvas는 가용 공간 전체를 사용하고, 전장의 비율 유지는 Scene의 카메라가 담당합니다.
  scale: { mode: Phaser.Scale.RESIZE, width: 1200, height: 600 },
  scene: [scene],
});
const unbindDisplay = bindDisplay(game, element('game'), element<HTMLButtonElement>('fullscreen'), status);
if (import.meta.hot) import.meta.hot.dispose(() => { unbindDisplay(); game.destroy(true); });

