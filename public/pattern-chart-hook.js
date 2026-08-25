(() => {
  'use strict';
  const LW=window.LightweightCharts;
  if(!LW?.createChart||window.SignalForgeChartBridge?.patched)return;

  const originalCreate=LW.createChart.bind(LW);
  const bridge=window.SignalForgeChartBridge={
    patched:true,
    version:'sf-chart-overlay-bridge-v2',
    chart:null,
    candleSeries:null,
    overlaySeries:new Set(),
    overlayPriceLines:new Set(),
    ready:false,
    lastError:null,
    lastAppliedAt:0
  };

  LW.createChart=function(...args){
    const chart=originalCreate(...args);
    const originalAdd=chart.addSeries.bind(chart);
    bridge.chart=chart;

    chart.addSeries=function(seriesDefinition,options){
      const series=originalAdd(seriesDefinition,options);
      const isCandlestick=seriesDefinition===LW.CandlestickSeries;
      const isKnownOverlay=seriesDefinition===LW.LineSeries||seriesDefinition===LW.HistogramSeries;
      if(!bridge.candleSeries&&(isCandlestick||!isKnownOverlay))bridge.candleSeries=series;
      return series;
    };

    bridge.addTrendLine=(points,options={})=>{
      try{
        if(!bridge.chart||!LW.LineSeries||!Array.isArray(points)||points.length<2)return null;
        const data=points
          .filter(p=>Number.isFinite(Number(p?.time))&&Number.isFinite(Number(p?.value)))
          .map(p=>({time:normalizeTime(p.time),value:Number(p.value)}))
          .filter(p=>Number.isFinite(p.time)&&p.time>0&&Number.isFinite(p.value));
        if(data.length<2)return null;
        const series=bridge.chart.addSeries(LW.LineSeries,{
          color:options.color||'#7ebcff',
          lineWidth:options.lineWidth||2,
          lineStyle:options.lineStyle??LW.LineStyle?.Dashed??2,
          lastValueVisible:false,
          priceLineVisible:false,
          crosshairMarkerVisible:false,
          title:options.title||''
        });
        series.setData(data);
        bridge.overlaySeries.add(series);
        bridge.lastAppliedAt=Date.now();
        return series;
      }catch(error){
        bridge.lastError=String(error?.message||error);
        console.warn('[SignalForge pattern overlay] Trend line failed.',error);
        return null;
      }
    };

    bridge.addPriceLine=(price,options={})=>{
      try{
        if(!bridge.candleSeries||!(Number(price)>0))return null;
        const line=bridge.candleSeries.createPriceLine({
          price:Number(price),
          color:options.color||'#7ebcff',
          lineWidth:options.lineWidth||1,
          lineStyle:options.lineStyle??LW.LineStyle?.Dashed??2,
          axisLabelVisible:options.axisLabelVisible!==false,
          title:options.title||''
        });
        bridge.overlayPriceLines.add(line);
        bridge.lastAppliedAt=Date.now();
        return line;
      }catch(error){
        bridge.lastError=String(error?.message||error);
        console.warn('[SignalForge pattern overlay] Price line failed.',error);
        return null;
      }
    };

    bridge.clearOverlays=()=>{
      for(const series of bridge.overlaySeries){try{bridge.chart?.removeSeries(series);}catch{}}
      bridge.overlaySeries.clear();
      for(const line of bridge.overlayPriceLines){try{bridge.candleSeries?.removePriceLine(line);}catch{}}
      bridge.overlayPriceLines.clear();
      bridge.lastError=null;
    };

    bridge.getOverlayState=()=>({
      ready:Boolean(bridge.ready&&bridge.chart&&bridge.candleSeries),
      trendLines:bridge.overlaySeries.size,
      priceLines:bridge.overlayPriceLines.size,
      total:bridge.overlaySeries.size+bridge.overlayPriceLines.size,
      lastAppliedAt:bridge.lastAppliedAt,
      lastError:bridge.lastError
    });

    bridge.ready=true;
    queueMicrotask(()=>window.dispatchEvent(new CustomEvent('signalforge:pattern-chart-ready',{detail:{bridge}})));
    return chart;
  };

  function normalizeTime(value){
    const n=Number(value);
    if(!Number.isFinite(n))return 0;
    return Math.floor(n>10_000_000_000?n/1000:n);
  }
})();
