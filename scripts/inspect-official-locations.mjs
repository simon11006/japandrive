const urls = ['https://www.you-i.okinawa/ko/office/nahaairport/', 'https://oshanboochuraumi.owst.jp/map', 'https://map.yahoo.co.jp/v3/place/MZZnWE8PU_w/map'];
for (const url of urls) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const html = await response.text();
    const results = [...html.matchAll(/.{0,120}(?:latitude|longitude|maps\/embed|maps\?q|!3d|!2d|latLng|LatLng|latlng|latlong|maps.app.goo.gl|26\.\d{4,}|127\.\d{4,}).{0,250}/gi)].map(m => m[0]);
    console.log(JSON.stringify({url,status:response.status,results:results.slice(0,30).map(text => text.replace(/key=[^&\s"<>]+/g,'key=[redacted]'))}));
  } catch (e) { console.log(url, e.message); }
}
