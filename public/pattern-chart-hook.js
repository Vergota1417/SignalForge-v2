(() => {
  'use strict';
  const LW=window.LightweightCharts;if(!LW?.createChart||window.SignalForgeChartBridge?.patched)return;
  const originalCreate=LW.createChart.bind(LW);
  const bridge=window.SignalForgeChartBridge={patched:true,chart:null,candleSeries:null,overlaySeries:new Set(),overlayPriceLines:new Set(),ready:false};
  LW.createChart=function(...args){
    const chart=originalCreate(...args),originalAdd=chart.addSeries.bind(chart);bridge.chart=chart;
    chart.addSeries=function(seriesDefinition,options){const series=originalAdd(seriesDefinition,options);if(!bridge.candleSeries&&seriesDefinition===LW.CandlestickSeries)bridge.candleSeries=series;return series;};
    bridge.addTrendLine=(points,options={})=>{if(!bridge.chart||!LW.LineSeries||!Array.isArray(points)||points.length<2)return null;const series=bridge.chart.addSeries(LW.LineSeries,{color:options.color||'#7ebcff',lineWidth:options.lineWidth||2,lineStyle:options.lineStyle??LW.LineStyle?.Dashed??2,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false,title:options.title||''});series.setData(points.filter(p=>Number.isFinite(Number(p?.time))&&Number.isFinite(Number(p?.value))).map(p=>({time:Math.floor(Number(p.time)/1000),value:Number(p.value)})));bridge.overlaySeries.add(series);return series;};
    bridge.addPriceLine=(price,options={})=>{if(!bridge.candleSeries||!(Number(price)>0))return null;const line=bridge.candleSeries.createPriceLine({price:Number(price),color:options.color||'#7ebcff',lineWidth:options.lineWidth||1,lineStyle:options.lineStyle??LW.LineStyle?.Dashed??2,axisLabelVisible:options.axisLabelVisible!==false,title:options.title||''});bridge.overlayPriceLines.add(line);return line;};
    bridge.clearOverlays=()=>{for(const series of bridge.overlaySeries){try{bridge.chart.removeSeries(series);}catch{}}bridge.overlaySeries.clear();for(const line of bridge.overlayPriceLines){try{bridge.candleSeries?.removePriceLine(line);}catch{}}bridge.overlayPriceLines.clear();};
    bridge.ready=true;queueMicrotask(()=>window.dispatchEvent(new CustomEvent('signalforge:pattern-chart-ready',{detail:{bridge}})));return chart;
  };
})();
