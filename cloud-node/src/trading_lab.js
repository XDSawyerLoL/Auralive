// AURA Trading Lab — READ-ONLY Kraken candles and deterministic PAPER ONLY backtest.
// No orders, no exchange credentials, no leverage, no paid API, no fabricated P&L.
// Signals use closed candles; entry and exit market orders fill at NEXT candle open.
const PAIRS=Object.freeze({XBTEUR:'XBTEUR',ETHEUR:'ETHEUR'});
const DEFAULTS=Object.freeze({starting_eur:1000,allocation:0.1,fee_rate:0.004,slippage_rate:0.001,stop_loss:0.04});
export function normalizePaperRequest(input={}){
  const pair=String(input.pair||'XBTEUR').toUpperCase();
  if(!(pair in PAIRS))throw Error('Paire non autorisée : XBTEUR ou ETHEUR');
  return {pair,interval_minutes:60,mode:'paper',...DEFAULTS};
}
export function parseKrakenCandles(data,pair='XBTEUR'){
  if(!data||!Array.isArray(data.error)||data.error.length)throw Error('Kraken : réponse de marché indisponible');
  const blocks=Object.entries(data.result||{}).filter(([key,value])=>key!=='last'&&Array.isArray(value));
  if(blocks.length!==1)throw Error('Kraken : données OHLC ambiguës');
  const rows=blocks[0][1];
  // Kraken's last candle is not closed; excluding it prevents look-ahead.
  return rows.slice(0,-1).map(row=>{
    const [time,o,h,l,c]=row;
    return {time:Number(time),open:Number(o),high:Number(h),low:Number(l),close:Number(c)};
  }).filter(row=>Number.isInteger(row.time)&&
    [row.open,row.high,row.low,row.close].every(x=>Number.isFinite(x)&&x>0)
    &&row.low<=Math.min(row.open,row.close)
    &&row.high>=Math.max(row.open,row.close))
    .sort((a,b)=>a.time-b.time)
    .filter((row,i,arr)=>i===0||row.time!==arr[i-1].time);
}
export async function fetchPaperMarket(pair='XBTEUR',{fetchFn=fetch}={}){
  const opts=normalizePaperRequest({pair});
  const url='https://api.kraken.com/0/public/OHLC?pair='+opts.pair+'&interval=60';
  const response=await fetchFn(url,{
    method:'GET',
    redirect:'error',
    headers:{Accept:'application/json','User-Agent':'AURA-Paper-Trading-Lab/1.0'},
    signal:AbortSignal.timeout(8000),
  });
  if(!response.ok)throw Error('Kraken : HTTP '+response.status);
  const data=await response.json();
  return parseKrakenCandles(data,pair);
}
function ema(values,period){
  const factor=2/(period+1);let value=values[0];
  return values.map((price,i)=>{
    if(i===0){value=price;return value;}
    value=(price-value)*factor+value;
    return value;
  });
}
function money(v){return Math.round((v+Number.EPSILON)*100)/100;}
export function backtestPaperCandles(rawCandles,options={}){
  const config=normalizePaperRequest(options);
  const candles=Array.isArray(rawCandles)?rawCandles:[];
  if(candles.length<85)throw Error('Historique insuffisant pour tester : minimum 85 bougies closes');
  const closes=candles.map(row=>Number(row.close));
  const fast=ema(closes,12),slow=ema(closes,48);
  let cash=config.starting_eur,units=0,entry=0,spent=0,entryIndex=-1;
  let highWater=cash,maxDrawdown=0,paidFees=0;const trades=[];
  const equityCurve=[];
  const fee=config.fee_rate,slip=config.slippage_rate;
  for(let i=49;i<candles.length;i++){
    const current=candles[i],prev=i-1;
    // The trade at open[i] is based exclusively on candle i-1 and earlier.
    const crossesUp=fast[prev-1]<=slow[prev-1]&&fast[prev]>slow[prev];
    const crossesDown=fast[prev-1]>=slow[prev-1]&&fast[prev]<slow[prev];
    const fillBuy=current.open*(1+slip),fillSell=current.open*(1-slip);
    const stopHit=units>0&&current.open<=entry*(1-config.stop_loss);
    if(units>0&&(crossesDown||stopHit)){
      const received=units*fillSell*(1-fee);
      const exitFee=units*fillSell*fee;
      const pnl=received-spent;
      paidFees+=exitFee;
      cash+=received;
      trades.push({type:'sell',time:current.time,price:money(fillSell),
        exit_reason:stopHit?'open-gap-stop':'signal',
        proceeds_eur:money(received),pnl_eur:money(pnl),
        entry_index:entryIndex,exit_index:i});
      units=0;entry=0;spent=0;entryIndex=-1;
    }else if(units===0&&crossesUp){
      const budget=Math.min(cash,config.starting_eur*config.allocation);
      if(budget>=10){
        units=budget/(fillBuy*(1+fee));
        cash-=budget;
        paidFees+=units*fillBuy*fee;
        entry=fillBuy;
        spent=budget;
        entryIndex=i;
        trades.push({type:'buy',time:current.time,price:money(fillBuy),
          invested_eur:money(budget),entry_index:i});
      }
    }
    const equity=cash+units*current.close*(1-fee);
    highWater=Math.max(highWater,equity);
    const drawdown=highWater>0?(highWater-equity)/highWater:0;
    maxDrawdown=Math.max(maxDrawdown,drawdown);
    equityCurve.push({time:current.time,equity_eur:money(equity)});
  }
  const last=candles[candles.length-1];
  const endValue=cash+units*last.close*(1-fee);
  const closed=trades.filter(t=>t.type==='sell');
  const winning=closed.filter(t=>t.pnl_eur>0).length;
  return {
    status:'simulation_only',real_money_traded:false,real_profit_eur:0,
    requested_pair:config.pair,interval_minutes:60,
    strategy:'EMA12/EMA48 crossover, next-bar open, 10% maximum initial allocation, long-only, no leverage',
    starting_eur:config.starting_eur,
    virtual_final_equity_eur:money(endValue),
    virtual_pnl_eur:money(endValue-config.starting_eur),
    virtual_return_pct:money(100*(endValue/config.starting_eur-1)),
    max_drawdown_pct:money(maxDrawdown*100),
    assumed_fee_pct:fee*100,assumed_slippage_pct:slip*100,
    assumed_fee_total_eur:money(paidFees),
    trades_count:trades.length,closed_trades:closed.length,
    win_rate_pct:closed.length?money(100*winning/closed.length):null,
    position_open:units>0,
    price_candles: candles.length,
    since:new Date(candles[0].time*1000).toISOString(),
    until:new Date(last.time*1000).toISOString(),
    checked_at:new Date().toISOString(),
    trades:trades.slice(-35),
    equity_curve:equityCurve.filter((_,index)=>index%Math.max(1,Math.ceil(equityCurve.length/90))===0).slice(-90),
    limitations:'Simulation historique courte (maximum 719 heures, environ 30 jours), sans garantie future. Bougies closes uniquement, exécution supposée au cours de la prochaine ouverture, écarts et frais estimés. Pas de stop intrabougie ni de liquidité garantie. Aucun ordre réel.',
  };
}
export async function runPaperBacktest(input={},dependencies={}){
  const opts=normalizePaperRequest(input);
  const candles=await fetchPaperMarket(opts.pair,dependencies);
  return backtestPaperCandles(candles,opts);
}
