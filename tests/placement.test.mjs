import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PlacementState } from '../.test-build/ui/placement-state.js';
import { Battle } from '../.test-build/core/battle.js';
const read = name => JSON.parse(readFileSync(new URL(`../src/data/${name}.json`, import.meta.url), 'utf8'));

test('전장 밖 드롭/방향 미지정으로는 확정할 수 없다', () => {
  const state = new PlacementState();
  assert.equal(state.intent(), null);
  state.begin('pikachu'); state.move(null);
  assert.equal(state.reserve(), false);
  state.move({x:2,y:1}); assert.equal(state.reserve(), true);
  assert.equal(state.intent(), null);
  state.aim(0, 0); assert.equal(state.intent(), null);
});
test('위치 예약과 취소는 전투 코스트/유닛 수에 영향을 주지 않는다', () => {
  const battle = new Battle(read('stage'), read('pokemon'));
  const state = new PlacementState();
  state.begin('pikachu'); state.move({x:2,y:1}); state.reserve();
  assert.equal(battle.cost, 24); assert.equal(battle.units.length, 0);
  state.cancel(); assert.equal(state.active, false); assert.equal(state.tile, null);
  assert.equal(state.intent(), null); assert.equal(battle.cost, 24);
});
test('방향 드래그는 네 방향으로 스냅하고 중앙으로 돌아오면 확정하지 않는다', () => {
  const state = new PlacementState();
  state.begin('pikachu'); state.move({x:2,y:1}); state.reserve();
  for (const [dx,dy,direction] of [[40,3,'east'],[-40,3,'west'],[3,-40,'north'],[3,40,'south']]) {
    state.aim(dx,dy); assert.equal(state.intent().direction, direction);
  }
  state.aim(5,5); assert.equal(state.intent(), null);
});
test('방향 대기 중 포인터 이동은 예약 위치를 바꾸지 않는다', () => {
  const state = new PlacementState();
  state.begin('pikachu'); state.move({x:2,y:1}); state.reserve();
  state.move({x:8,y:5}); state.aim(0,50);
  assert.deepEqual(state.intent().tile, {x:2,y:1});
  state.begin('squirtle'); assert.equal(state.phase, 'dragging');
  assert.equal(state.tile, null); assert.equal(state.direction, null);
});
test('확정 시에만 원래 배치 API를 호출해 한 번 차감하고 예약을 정리한다', () => {
  const battle = new Battle(read('stage'), read('pokemon'));
  const state = new PlacementState();
  state.begin('pikachu'); state.move({x:2,y:1}); state.reserve(); state.aim(0,40);
  const intent = state.intent();
  assert.equal(battle.deploy(intent.pokemonId, intent.tile.x, intent.tile.y, intent.direction), null);
  state.cancel();
  assert.equal(battle.units.length, 1); assert.equal(battle.cost, 12);
  assert.equal(battle.units[0].direction, 'south'); assert.equal(state.intent(), null);
});
test('예약 후 조건이 바뀌면 최종 재검사로 잘못된 배치를 막는다', () => {
  const battle = new Battle(read('stage'), read('pokemon'));
  const state = new PlacementState();
  state.begin('pikachu'); state.move({x:2,y:1}); state.reserve(); state.aim(40,0);
  battle.cost = 0;
  const intent = state.intent();
  assert.ok(battle.deploy(intent.pokemonId, intent.tile.x, intent.tile.y, intent.direction));
  assert.equal(battle.units.length, 0); assert.equal(battle.cost, 0);
});
