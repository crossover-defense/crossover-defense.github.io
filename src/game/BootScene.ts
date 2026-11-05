import Phaser from 'phaser';
import demo from '../data/demo.json';

/** 환경 확인 전용 Scene. 전투 규칙이나 유닛을 표현하지 않습니다. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    const marker = this.add.rectangle(400, 190, 64, 64, 0x75e0cc);
    this.add.text(400, 300, demo.label, {
      fontFamily: 'Arial, sans-serif', fontSize: '26px', color: '#e6edf7',
    }).setOrigin(0.5);
    this.tweens.add({ targets: marker, angle: 360, duration: 6000, repeat: -1 });
    const status = document.querySelector<HTMLElement>('#status');
    if (status) status.textContent = 'Phaser Scene 실행 완료';
  }
}
