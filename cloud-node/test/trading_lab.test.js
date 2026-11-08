import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizePaperRequest,parseKrakenCandles,backtestPaperCandles,runPaperBacktest} from '../src/trading_lab.js';

function candles(count=120,closing=(i)=>100+i*0.35){
  return Array.from({length:count},(_,i)=>{
    const open=closing(i),close=open+0.05;
    return {time:1730000000+i*3600,open,high:open+1,low:open-1,close};
  });
}
test('paper trading allowlist and immutable no-broker mode',()=>{
  const request=normalizePaperRequest({pair:'ETHEUR',mode:'real',starting_eur:999999999,allocation:1});
  assert.equal(request.mode,'paper');
  assert.equal(request.starting_eur,1000);
  assert.equal(request.allocation,0.1);
  assert.equal(request.pair,'ETHEUR');
  assert.throws(()=>normalizePaperRequest({pair:'USDJPY'}),/non autorisée/);
});
test('Kraken candle parser drops currently unfinished candle and rejects invalid data',()=>{
  const result=parseKrakenCandles({error:[],result:{XXBTZEUR:[
    [1700000000,'100','105','99','104'],
    [1700003600,'104','106','101','103'],
    [1700007200,'103','109','102','108'],
  ],last:123}});
  assert.equal(result.length,2);
  assert.equal(result[1].close,103);
  assert.throws(()=>parseKrakenCandles({error:['Rate limit'],result:{}}),/indisponible/);
});
test('backtest never invents real profit or dispatches live orders',()=>{
  const report=backtestPaperCandles(candles(150),{pair:'XBTEUR',live:true,starting_eur:500000});
  assert.equal(report.status,'simulation_only');
  assert.equal(report.real_money_traded,false);
  assert.equal(report.real_profit_eur,0);
  assert.equal(report.starting_eur,1000);
  assert.equal(report.assumed_fee_pct,0.4);
  assert.equal(report.assumed_slippage_pct,0.1);
  assert.ok(report.virtual_final_equity_eur>=0);
});
test('never uses an unfinished last candle to backtest',()=>{
  const rows=candles(110);
  const before=backtestPaperCandles(rows);
  const after=backtestPaperCandles([...rows,{time:rows.at(-1).time+3600,open:1,high:1,low:1,close:1}]);
  assert.notEqual(before.until,after.until);
});
test('insufficient history is rejected, not extrapolated',()=>{
  assert.throws(()=>backtestPaperCandles(candles(60)),/minimum 85/);
});
test('no real money movements and public market endpoint stays fixed',async()=>{
  let accessed,options;
  const data={error:[],result:{XXBTZEUR:[
    ...Array.from({length:100},(_,i)=>[1700000000+i*3600,100+i+'',101+i+'',99+i+'',100.5+i+'']),
  ],last:12}};
  const result=await runPaperBacktest({pair:'XBTEUR',live:true},{
    fetchFn:async(url,opts)=>{
      accessed=url;options=opts;
      return {ok:true,json:async()=>data};
    },
  });
  assert.equal(accessed,'https://api.kraken.com/0/public/OHLC?pair=XBTEUR&interval=60');
  assert.equal(options.method,'GET');
  assert.equal(options.redirect,'error');
  assert.equal(result.real_money_traded,false);
});
test('server trading routes are private, cannot send real orders or broker credentials',()=>{
  const server=fs.readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  const begin=server.indexOf("app.get('/api/trading/mode'");
  const end=server.indexOf("// Founder-only knowledge endpoints.",begin);
  const block=server.slice(begin,end);
  assert.ok(begin>=0 && end>begin);
  assert.equal((block.match(/requirePrivate\(request, reply\)/g)||[]).length,3);
  assert.match(block,/runPaperBacktest/);
  assert.doesNotMatch(block,/orders\/create|api\/trading\/live|private\/AddOrder|broker_token/);
});
test('dashboard simulation is visibly labeled and clickable',()=>{
  const html=fs.readFileSync(new URL('../src/dashboard.js',import.meta.url),'utf8');
  const js=fs.readFileSync(new URL('../src/dashboard-runtime.js',import.meta.url),'utf8');
  assert.match(html,/id="tradeBacktest"/);
  assert.match(html,/PAPER ONLY/);
  assert.match(js,/tradeBacktest'\)\.onclick/);
  assert.match(js,/status!=='simulation_only'/);
  assert.match(js,/real_money_traded!==false/);
});

test('autonomous scan runs only in simulation and cannot trigger brokerage orders',()=>{
  const server=fs.readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  assert.match(server,/PAPER_AUTO_INTERVAL_MS=6\*60\*60\*1000/);
  assert.match(server,/runAutomaticPaperScan/);
  assert.match(server,/process\.env\.CI==='true'/);
  assert.match(server,/AURA_PAPER_MONITOR_ENABLED==='false'/);
  assert.match(server,/startAutomaticPaperScan\(\)/);
  assert.match(server,/app\.get\('\/api\/trading\/paper\/status'/);
  const start=server.indexOf('async function runAutomaticPaperScan()');
  const end=server.indexOf('function startAutomaticPaperScan()',start);
  const block=server.slice(start,end);
  assert.match(block,/runPaperBacktest\(\{pair:'XBTEUR'\}\)/);
  assert.doesNotMatch(block,/AddOrder|create_order|submitOrder|liveTrading|API_KEY/);
  assert.match(server,/real_money_traded:false,real_profit_eur:0/);
});
