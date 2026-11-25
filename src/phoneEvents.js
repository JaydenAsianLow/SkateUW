import { phone } from './state.js';
import { commands } from './settings.js';

// What each phone event does to the game: queues a move for the skateboard (Skateboard.jsx reads the queues every
// frame). The laptop calls this for events arriving from the real phone (Display.jsx); the Controls guide's demo
// scene calls it for its scripted phone inputs (guide/DemoStage.jsx), so both go through the same path.
export const PHONE_EVENTS = ['push', 'pop', 'trick', 'revert', 'partial', 'grindTap', 'reset', 'carry', 'jump', 'setSpawn'];

export function applyPhoneEvent(name, d) {
  switch (name) {
    case 'push':
      phone.pushQueued = Math.min(3, phone.pushQueued + (d?.power ?? 1));
      break;
    case 'pop':
      phone.popQueued = d?.power ?? 1;
      phone.popNose = d?.nose === true;
      break;
    case 'trick':
      if (d?.type) phone.trickQueued = { type: d.type, side: d.side ?? 1 };
      break;
    case 'revert':
      phone.revertQueued = d?.dir ?? 1;
      break;
    case 'partial':
      phone.partialQueued = true;
      break;
    case 'grindTap':
      phone.tapQueued = true;
      break;
    case 'reset':
      phone.resetQueued = true;
      break;
    case 'carry':
      phone.carryQueued = true;
      break;
    case 'jump':
      phone.jumpQueued = true;
      break;
    case 'setSpawn':
      commands.setSpawn = true;
      break;
  }
}
