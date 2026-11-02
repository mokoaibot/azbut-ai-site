'use strict';
const store = require('../lib/store');
const auth = require('../lib/auth');
const config = require('../lib/config');
store.reset();
auth.ensureAdmin();
console.log('[azbut] Данные сброшены к seed/.');
console.log('[azbut] Демо-доступ: admin / ' + config.ADMIN_PASSWORD);
console.log('[azbut] Данные читаются с диска на каждый запрос; перезапуск нужен только для сброса активных сессий.');
