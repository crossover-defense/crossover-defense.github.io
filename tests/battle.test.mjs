import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Battle, inRange } from '../.test-build/battle.js';

const read = name => JSON.parse(readFileSync(new URL(`../src/data/${name}.json`, import.meta.url), 'utf8'));
const roster = read('pokemon');
const stage = read('stage');
const simulate = (battle, seconds) => { for (let i = 0; i < seconds * 30; i++) battle.step(1 / 30); };

test('맵은 직사각형이며 경로는 인접한 지상 타일과 양 끝 지점으로 연결된다', () => {
  assert.ok(stage.tiles.every(row => row.length === 11));
  stage.route.forEach((point, index) => {
    assert.ok('.SE'.includes(stage.tiles[point.y][point.x]));
    if (index > 0) {
      const prev = stage.route[index - 1];
      assert.equal(Math.abs(point.x - prev.x) + Math.abs(point.y - prev.y), 1);
    }
  });
});
test('잘못된 지형/중복/코스트 부족 배치가 상태를 바꾸지 않는다', () => {
  const battle = new Battle(stage, roster);
  assert.ok(battle.deploy('pikachu', 1, 2, 'east'));
  assert.equal(battle.cost, stage.initialCost);
  assert.equal(battle.deploy('pikachu', 2, 1, 'south'), null);
  const paid = battle.cost;
  assert.ok(battle.deploy('pikachu', 3, 1, 'south'));
  assert.ok(battle.deploy('charmander', 3, 1, 'south'));
  assert.equal(battle.cost, paid);
  assert.equal(battle.units.length, 1);
  assert.ok(battle.deploy('missing', 1, 1, 'east'));
  assert.ok(battle.deploy('bulbasaur', 1.5, 2, 'east'));
});
test('방향별 범위는 회전하며 후방을 공격하지 않는다', () => {
  const origin = { x: 3, y: 3 };
  for (const [direction, target] of [['east',{x:5,y:3}],['west',{x:1,y:3}],['north',{x:3,y:1}],['south',{x:3,y:5}]]) {
    assert.equal(inRange(origin, target, direction, 2, 0), true);
  }
  assert.equal(inRange(origin, {x:2,y:3}, 'east', 3, 1), false);
  assert.equal(inRange(origin, {x:6,y:5}, 'east', 3, 1), false);
});
test('준비 중 시간은 멈추고 시작 후 코스트가 회복되며 상한을 지킨다', () => {
  const battle = new Battle(stage, roster);
  simulate(battle, 2); assert.equal(battle.elapsed, 0); assert.equal(battle.spawned, 0);
  battle.start(); simulate(battle, 2);
  assert.ok(Math.abs(battle.cost - 26) < 0.001);
  assert.equal(battle.spawned, 1);
  battle.cost = 98.9; simulate(battle, 2); assert.equal(battle.cost, 99);
});
test('무배치 전투는 방어 수치 0에서 실패하며 종료 후 상태가 고정된다', () => {
  const battle = new Battle(stage, roster); battle.start(); simulate(battle, 80);
  assert.equal(battle.status, 'lost'); assert.equal(battle.life, 0);
  assert.equal(battle.leaked, 5);
  const elapsed = battle.elapsed; simulate(battle, 10); assert.equal(battle.elapsed, elapsed);
  assert.ok(battle.deploy('bulbasaur', 1, 2, 'west'));
});
test('지상 유닛은 저지하고 적에게 피해를 받으며 철수는 코스트를 반환하지 않는다', () => {
  const battle = new Battle(stage, roster);
  battle.deploy('squirtle', 2, 2, 'west'); battle.start(); simulate(battle, 4);
  assert.ok(battle.units[0].hp < roster.find(item => item.id === 'squirtle').hp);
  assert.ok(battle.enemies[0].progress < 2);
  const paid = battle.cost; battle.retreat(battle.units[0].id);
  assert.equal(battle.cost, paid); assert.equal(battle.units.length, 0);
});
test('실제 예제 데이터의 방어 조합으로 승리하고 적 수가 보존된다', () => {
  const battle = new Battle({...stage, initialCost:99}, roster);
  battle.deploy('pikachu', 2, 1, 'south');
  battle.deploy('charmander', 3, 3, 'east');
  battle.deploy('bulbasaur', 4, 2, 'west');
  battle.deploy('squirtle', 6, 4, 'west');
  battle.start(); simulate(battle, 100);
  assert.equal(battle.status, 'won');
  assert.equal(battle.defeated + battle.leaked, stage.enemy.count);
  assert.equal(battle.enemies.length, 0); assert.ok(battle.defeated > 0);
});
test('초기 24코스트와 자연 회복만으로 예제 작전을 클리어할 수 있다', () => {
  const battle = new Battle(stage, roster);
  battle.deploy('pikachu', 2, 1, 'south');
  battle.deploy('bulbasaur', 4, 2, 'west');
  battle.start();
  let fireDeployed = false;
  let waterDeployed = false;
  for (let tick = 0; tick < 3000; tick++) {
    if (!fireDeployed && battle.cost >= 14) fireDeployed = battle.deploy('charmander', 3, 3, 'east') === null;
    if (fireDeployed && !waterDeployed && battle.cost >= 12) waterDeployed = battle.deploy('squirtle', 6, 4, 'west') === null;
    battle.step(1 / 30);
  }
  assert.equal(battle.status, 'won');
  assert.equal(battle.defeated + battle.leaked, 16);
});
