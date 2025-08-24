// いまは未使用のダミー。将来、重いシミュレーションをWebWorkerに逃がすとき用。
self.onmessage = (e)=>{
  // 期待： {cmd:'ping'} → {pong:true}
  const {cmd} = e.data || {};
  if(cmd === 'ping'){ self.postMessage({pong:true}); }
};
