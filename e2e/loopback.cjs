// Preloaded (`node --require`) into the API and SSR children: their code calls `listen(port)` without a
// host, which binds every interface. The e2e stack runs with THROTTLE_DISABLED and NODE_ENV=development
// and must not be reachable from the LAN, so a port-only listen is pinned to 127.0.0.1.
const net = require('node:net');
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  if (typeof args[0] === 'number' || /^[0-9]+$/.test(String(args[0]))) {
    if (args[1] == null) args[1] = '127.0.0.1';
    else if (typeof args[1] !== 'string') args.splice(1, 0, '127.0.0.1');
  }
  return listen.apply(this, args);
};
