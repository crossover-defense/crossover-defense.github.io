import type Phaser from 'phaser';

/** 화면 크기·전체화면은 전투 상태와 분리합니다. 반환 함수는 개발 중 재로딩 시 정리용입니다. */
export function bindDisplay(game: Phaser.Game, host: HTMLElement, button: HTMLButtonElement, status: HTMLElement): () => void {
  const listeners = new AbortController();
  let disposed = false;

  const resize = (): void => {
    if (disposed || !game.isBooted) return;
    // 창 크기뿐 아니라 상하단 UI의 줄바꿈으로 부모 높이가 바뀌는 경우도 추적합니다.
    const width = Math.floor(host.clientWidth);
    const height = Math.floor(host.clientHeight);
    if (width > 0 && height > 0 && (game.scale.width !== width || game.scale.height !== height)) {
      game.scale.resize(width, height);
    }
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  game.events.once('ready', resize);
  resize();

  const syncFullscreen = (): void => {
    // Esc 등으로 나간 경우도 브라우저의 실제 상태를 기준으로 버튼을 동기화합니다.
    const active = document.fullscreenElement === document.documentElement;
    button.textContent = active ? '전체화면 해제' : '전체화면';
    button.setAttribute('aria-pressed', String(active));
    button.title = active ? '일반 화면으로 돌아가기 (Esc)' : '전체화면으로 전환';
  };
  if (!document.fullscreenEnabled) {
    button.disabled = true;
    button.title = '이 브라우저 또는 실행 환경은 전체화면을 지원하지 않습니다.';
  }
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      // 사용자 클릭 안에서 직접 요청해야 브라우저가 전체화면을 허용합니다.
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // 거부/미지원 시 전투를 중단하지 않고 기존 상태 안내 영역에 이유를 표시합니다.
      status.textContent = '전체화면을 전환하지 못했습니다. 브라우저의 전체화면 허용 여부를 확인해 주세요.';
    } finally {
      if (!disposed) { button.disabled = !document.fullscreenEnabled; syncFullscreen(); }
    }
  }, { signal: listeners.signal });
  document.addEventListener('fullscreenchange', syncFullscreen, { signal: listeners.signal });
  syncFullscreen();

  return () => {
    disposed = true;
    observer.disconnect();
    game.events.off('ready', resize);
    listeners.abort();
  };
}
