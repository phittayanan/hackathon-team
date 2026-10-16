// Every scene is a prebuilt full-screen UI. mount(el, data, agent) fills it from data
// and returns { onAction(action) } for steps the user speaks while it is open.
import payment from './payment.js';
import shopping from './shopping.js';
import flight from './flight.js';
import training from './training.js';
import generated from './generated.js';
import secretary from './secretary.js';
import memory from './memory.js';
import videoSearch from './video-search.js';

export const SCENES = { payment, shopping, flight, training, generated, secretary, memory, 'video-search': videoSearch };
