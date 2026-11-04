(function(root){
  'use strict';
  const KEY='jarvis_saved_products_v1', LIMIT=50;
  function clean(value,max=180){return String(value||'').replace(/[\\u0000-\\u001f]/g,' ').replace(/\\s+/g,' ').trim().slice(0,max)}
  function safeUrl(value){try{const u=new URL(String(value||''));return ['http:','https:'].includes(u.protocol)?u.toString():null}catch(_){return null}}
  function parseEuroPrice(text){
    const s=String(text||'').replace(/\\u00a0/g,' ');
    const m=s.match(/(?:€\\s*(\\d{1,6}(?:[.,]\\d{1,2})?)|(\\d{1,6}(?:[.,]\\d{1,2})?)\\s*(?:€|euros?))/i);
    if(!m)return null;
    const raw=(m[1]||m[2]).replace(/\\./g,'').replace(',','.');
    const n=Number(raw);return Number.isFinite(n)&&n>0?n:null;
  }
  function normalize(item){
    if(!item||typeof item!=='object')return null;
    const url=safeUrl(item.url);if(!url)return null;
    const title=clean(item.title,180);if(!title)return null;
    const snippet=clean(item.snippet,420);
    return {id:clean(item.id,80)||url,title,url,snippet,description:clean(item.description,1200),brand:clean(item.brand,100),model:clean(item.model,100),sku:clean(item.sku,100),specifications:Array.isArray(item.specifications)?item.specifications.slice(0,40).map(x=>({name:clean(x.name,100),value:clean(x.value,220)})):[],availability:clean(item.availability,40)||'not-confirmed',price:typeof item.price==='number'&&Number.isFinite(item.price)?item.price:parseEuroPrice(item.priceText||snippet||title),currency:clean(item.currency,8)||'EUR',store:clean(item.store||new URL(url).hostname.replace(/^www\\./,''),80),savedAt:item.savedAt||new Date().toISOString(),checkedAt:item.checkedAt||item.extractedAt||null};
  }
  function read(storage){
    try{const raw=(storage||root.localStorage).getItem(KEY);const parsed=raw?JSON.parse(raw):[];return Array.isArray(parsed)?parsed.map(normalize).filter(Boolean).slice(0,LIMIT):[]}catch(_){return []}
  }
  function write(items,storage){(storage||root.localStorage).setItem(KEY,JSON.stringify(items.slice(0,LIMIT)));return items}
  function save(item,storage){
    const product=normalize(item);if(!product)throw new Error('El producto necesita un título y un enlace HTTP o HTTPS válido.');
    const items=read(storage),index=items.findIndex(x=>x.url===product.url);
    if(index>=0)items[index]={...items[index],...product,savedAt:items[index].savedAt};
    else items.unshift(product);
    write(items,storage);return product;
  }
  function remove(idOrUrl,storage){const items=read(storage).filter(x=>x.id!==idOrUrl&&x.url!==idOrUrl);write(items,storage);return items.length}
  function list(storage){return read(storage)}
  function compare(ids,storage){
    const items=read(storage),selected=Array.isArray(ids)&&ids.length?items.filter(x=>ids.includes(x.id)||ids.includes(x.url)):items;
    return selected.map(x=>({title:x.title,store:x.store,price:x.price,currency:x.currency,url:x.url,checkedAt:x.checkedAt||x.savedAt}));
  }
  function exportData(storage){return list(storage)}
  function importData(data,storage){if(!Array.isArray(data))return 0;const cleanItems=data.map(normalize).filter(Boolean).slice(0,LIMIT);write(cleanItems,storage);return cleanItems.length}
  root.JarvisProducts={key:KEY,parseEuroPrice,normalize,save,remove,list,compare,exportData,importData};
})(typeof window!=='undefined'?window:globalThis);
