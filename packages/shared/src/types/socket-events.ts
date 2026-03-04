export const SOCKET_EVENTS = {
  // Connection & Auth
  JOIN_CAMPAIGN: 'campaign:join',
  CAMPAIGN_STATE: 'campaign:state',
  CAMPAIGN_PLAYERS: 'campaign:players',

  // Map
  MAP_LOAD: 'map:load',
  MAP_GRID_UPDATE: 'map:grid:update',

  // Tokens
  TOKEN_ADD: 'token:add',
  TOKEN_MOVE: 'token:move',
  TOKEN_UPDATE: 'token:update',
  TOKEN_REMOVE: 'token:remove',

  // Fog
  FOG_REVEAL: 'fog:reveal',
  FOG_HIDE: 'fog:hide',
  FOG_TOGGLE: 'fog:toggle',

  // Initiative
  INIT_ADD: 'init:add',
  INIT_REMOVE: 'init:remove',
  INIT_UPDATE: 'init:update',
  INIT_NEXT: 'init:next',
  INIT_SORT: 'init:sort',
  INIT_CLEAR: 'init:clear',
  INIT_TOGGLE: 'init:toggle',

  // Dice
  DICE_ROLL: 'dice:roll',

  // Session
  SESSION_SAVE: 'session:save',
  SESSION_LOAD: 'session:load',
  SESSION_LIST: 'session:list',
} as const;
