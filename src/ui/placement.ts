import type { Battle, Direction, Pokemon } from '../core/battle';
import type { BattleScene } from '../game/BattleScene';
import { PlacementState } from './placement-state';

interface PlacementElements {
  field: HTMLElement; overlay: HTMLElement; compass: HTMLElement; cancel: HTMLButtonElement;
  ghost: HTMLElement; hint: HTMLElement; status: HTMLElement;
}
export interface PlacementController {
  cancel(message?: string): void;
  reserve(x: number, y: number): void;
  confirmDirection(direction: Direction): void;
  render(): void;
  dispose(): void;
}

/** HTML 카드와 Phaser 전장을 Pointer Events로 연결합니다. 마우스/터치 입력 경로를 공유합니다. */
export function bindPlacement(state: PlacementState, scene: BattleScene, getBattle: () => Battle,
  roster: readonly Pokemon[], cards: ReadonlyMap<string, HTMLButtonElement>, ui: PlacementElements,
  onChange: () => void): PlacementController {
  const events = new AbortController();
  const options = { signal: events.signal };
  let pointer: { id: number; target: HTMLElement; kind: 'position' | 'direction' } | null = null;
  let lastPosition = { x: 0, y: 0 };

  function release(): void {
    const previous = pointer;
    pointer = null; // lostpointercapture가 뒤따라 발생해도 완료된 드롭을 취소하지 않습니다.
    if (previous?.target.hasPointerCapture(previous.id)) previous.target.releasePointerCapture(previous.id);
  }
  function syncPreview(): void {
    scene.placementActive = state.active;
    scene.placementTile = state.tile;
    scene.placementDirection = state.direction;
  }
  function cancel(message = '배치 예약을 취소했습니다. 코스트는 사용하지 않았습니다.'): void {
    release(); state.cancel(); scene.selectedPokemon = null;
    ui.overlay.hidden = true; ui.ghost.hidden = true;
    ui.field.classList.remove('placing');
    syncPreview();
    if (message) ui.status.textContent = message;
    onChange();
  }
  function begin(pokemon: Pokemon): void {
    state.begin(pokemon.id); scene.selectedPokemon = pokemon; scene.selectedUnit = null;
    ui.ghost.innerHTML = `${cards.get(pokemon.id)?.querySelector('svg')?.outerHTML ?? ''}<strong>${pokemon.name}</strong>`;
    ui.status.textContent = `${pokemon.name}을 배치할 타일까지 끌어 놓으세요. 초록 타일에 배치할 수 있습니다.`;
    ui.field.classList.add('placing'); syncPreview(); onChange();
  }
  function reserve(x: number, y: number): void {
    const pokemon = scene.selectedPokemon;
    if (!pokemon || state.phase !== 'dragging') return;
    const error = getBattle().deploymentError(pokemon, x, y);
    if (error) { cancel(error); return; }
    state.move({ x, y }); state.reserve(); syncPreview();
    ui.status.textContent = '위치 예약 완료 · 중앙에서 원하는 방향으로 끌었다 놓으세요. X로 취소할 수 있습니다.';
    render(); onChange();
  }
  function confirm(): void {
    const intent = state.intent();
    if (!intent) return;
    // 슬로모션 중에도 전투는 진행됩니다. 최종 확정 시 배치 조건을 다시 검사합니다.
    const error = getBattle().deploy(intent.pokemonId, intent.tile.x, intent.tile.y, intent.direction);
    if (error) { cancel(error); return; }
    scene.selectedUnit = getBattle().units.at(-1)?.id ?? null;
    cancel('배치 완료 · 유닛을 누르면 공격 범위 확인과 철수가 가능합니다.');
  }
  function confirmDirection(direction: Direction): void {
    if (state.phase !== 'direction') return;
    state.direction = direction; confirm();
  }
  function render(): void {
    syncPreview();
    ui.overlay.hidden = state.phase !== 'direction';
    ui.ghost.hidden = state.phase !== 'dragging' || !!state.tile || !pointer;
    if (!ui.ghost.hidden) {
      ui.ghost.style.left = `${lastPosition.x}px`; ui.ghost.style.top = `${lastPosition.y}px`;
    }
    if (state.phase !== 'direction' || !state.tile) return;
    const position = scene.tileClientPosition(state.tile);
    if (!position) return;
    const bounds = ui.field.getBoundingClientRect();
    const radius = ui.compass.offsetWidth / 2 + 6;
    // 가장자리 타일에서도 취소 X가 화면 밖으로 잘리지 않도록 방향 UI만 안쪽으로 옮깁니다.
    const clamp = (value: number, max: number): number => Math.max(radius, Math.min(value, max - radius));
    ui.compass.style.left = `${clamp(position.x - bounds.left, bounds.width)}px`;
    ui.compass.style.top = `${clamp(position.y - bounds.top, bounds.height)}px`;
    ui.compass.dataset.facing = state.direction ?? '';
    const names = { east: '오른쪽', west: '왼쪽', north: '위쪽', south: '아래쪽' };
    ui.hint.textContent = state.direction ? `${names[state.direction]} · 놓으면 배치` : '중앙에서 방향으로 드래그';
  }
  for (const pokemon of roster) {
    const card = cards.get(pokemon.id);
    if (!card) continue;
    card.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0 || card.disabled || pointer) return;
      event.preventDefault(); cancel(''); begin(pokemon);
      lastPosition = { x: event.clientX, y: event.clientY };
      pointer = { id: event.pointerId, target: card, kind: 'position' };
      card.setPointerCapture(event.pointerId); render();
    }, options);
    card.addEventListener('click', event => {
      // 키보드/보조기술로도 카드 → 타일 선택 → 방향 버튼 순서로 배치할 수 있습니다.
      if (event.detail === 0 && !card.disabled) { cancel(''); begin(pokemon); }
    }, options);
    card.addEventListener('dragstart', event => event.preventDefault(), options);
    card.addEventListener('lostpointercapture', event => { if (pointer?.id === event.pointerId) cancel(); }, options);
  }
  ui.compass.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || state.phase !== 'direction' || pointer) return;
    if ((event.target as Element).closest('button')) return;
    event.preventDefault();
    pointer = { id: event.pointerId, target: ui.compass, kind: 'direction' };
    ui.compass.setPointerCapture(event.pointerId);
  }, options);
  ui.compass.addEventListener('lostpointercapture', event => { if (pointer?.id === event.pointerId) cancel(); }, options);
  window.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer?.id) return;
    lastPosition = { x: event.clientX, y: event.clientY };
    if (pointer.kind === 'position') state.move(scene.tileAtClient(event.clientX, event.clientY));
    else {
      const rect = ui.compass.getBoundingClientRect();
      state.aim(event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2);
    }
    render(); onChange();
  }, options);
  window.addEventListener('pointerup', event => {
    if (event.pointerId !== pointer?.id) return;
    const kind = pointer.kind; release();
    if (kind === 'position') {
      const tile = scene.tileAtClient(event.clientX, event.clientY);
      if (tile) reserve(tile.x, tile.y);
      else cancel('전장 밖에 놓아 배치를 취소했습니다.');
    } else {
      const rect = ui.compass.getBoundingClientRect();
      state.aim(event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2);
      if (state.direction) confirm();
      else { render(); ui.status.textContent = '방향을 충분히 끌어 지정해 주세요. X로 취소할 수 있습니다.'; }
    }
  }, options);
  window.addEventListener('pointercancel', event => { if (event.pointerId === pointer?.id) cancel(); }, options);
  window.addEventListener('blur', () => { if (state.active) cancel(); }, options);
  document.addEventListener('visibilitychange', () => { if (document.hidden && state.active) cancel(); }, options);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && state.active) { event.preventDefault(); cancel(); } }, options);
  ui.cancel.addEventListener('click', () => cancel(), options);
  ui.compass.querySelectorAll<HTMLButtonElement>('[data-facing]').forEach(button => {
    button.addEventListener('click', () => {
      const direction = button.dataset.facing;
      if (direction === 'east' || direction === 'west' || direction === 'north' || direction === 'south') confirmDirection(direction);
    }, options);
  });
  return { cancel, reserve, confirmDirection, render, dispose: () => {
    release(); state.cancel(); syncPreview(); events.abort();
    ui.overlay.hidden = true; ui.ghost.hidden = true; ui.field.classList.remove('placing');
  } };
}
