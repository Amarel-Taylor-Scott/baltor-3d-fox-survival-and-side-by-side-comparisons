// A controller, not a replay of positions: every result goes through stepGame.
// Route progress comes only from the real collected and activated game state.
export const DEMO_ROUTE = Object.freeze({
  wisps: [[-3, 16], [-12, 10], [-18, 1], [-16, -12], [-8, -20], [0, -25], [12, -24], [20, -16], [21, -6]],
  shrines: [[-18, -5], [0, -28], [22, 0]],
  return: [[20, 12], [10, 22], [0, 22]],
});

export function demoInput(state) {
  const idle = { moveX: 0, moveZ: 0, sprint: false, jump: false, interact: false, sniff: false };
  if (!state || state.status === 'won') return idle;
  const time = Number(state.time) || 0;
  const x = Number(state.x) || 0, z = Number(state.z) || 0;
  const collected = Math.max(0, Math.min(9, Number(state.totalCollected ?? state.collectedIds?.length) || 0));
  const activated = Math.max(0, Math.min(3, state.activatedIds?.length || 0));
  if (time < 1.5) return idle;

  let target, atShrine = false;
  if (collected >= (activated + 1) * 3 && activated < 3) {
    target = DEMO_ROUTE.shrines[activated];
    atShrine = true;
  } else if (collected < 9) {
    target = DEMO_ROUTE.wisps[collected];
  } else if (z < 11.7) {
    target = DEMO_ROUTE.return[0];
  } else if (x > 10.5) {
    target = DEMO_ROUTE.return[1];
  } else {
    target = DEMO_ROUTE.return[2];
  }
  const dx = target[0] - x, dz = target[1] - z;
  const distance = Math.hypot(dx, dz);
  const frame = Math.floor(time * 60 + 0.0001);
  // Interact is a pulse, so successive shrines receive a fresh rising edge.
  if (atShrine && distance < 2.1) {
    const earliestActivation = [13, 27, 42][activated];
    return { ...idle, interact: time >= earliestActivation && frame % 24 < 3 };
  }
  if (distance < 0.22) return idle;
  // Brief observation beats keep a 60-second tour readable. These never set
  // position, inventory, score, animation or win state.
  const observing = [12, 24, 36].some(start => time >= start && time < start + 1.1);
  if (observing) return { ...idle, sniff: frame % 240 < 3 };
  return {
    moveX: dx / distance,
    moveZ: dz / distance,
    sprint: distance > 3.6 && frame % 600 >= 420,
    jump: time >= 5.5 && time < 5.55,
    interact: false,
    sniff: frame % 300 < 3,
  };
}
