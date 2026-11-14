// Architectural treatments are representative; mapped outlines/heights win.
export const CITY_STYLES={
 sydney:{colors:['#d1c9b8','#aaaeb5','#b6c8cf','#9eafa9','#d9cbb3','#acb8bf'],levels:9,glass:true,trees:true,undergroundPower:true,shops:['COFFEE','BOOKSHOP','PHARMACY','BAKERY','GROCER','OFFICE']},
 auckland:{colors:['#d0cfc8','#adc3ca','#afb5b6','#c4b8a6','#ddd7c8','#8a9ca2'],levels:7,glass:true,trees:true,undergroundPower:true,shops:['CAFE','BOOKS','PHARMACY','BAKERY','MARKET','OFFICE']},
 'australia-town':{colors:['#ad7866','#ccb89e','#e0d9c7','#ac9f8c','#bd8a75','#d8cbb7'],levels:3,glass:false,trees:true,pitched:true,shops:['CAFE','BAKERY','GROCER','BOOKS','PHARMACY','LOCAL SHOP']},
 'new-zealand-town':{colors:['#dddcd2','#c7c0b2','#adbec1','#d3c5b2','#b3b7ad','#dad2c2'],levels:2,glass:false,trees:true,pitched:true,shops:['CAFE','BAKERY','DAIRY','BOOKSHOP','PHARMACY','LOCAL SHOP']},
 tokyo:{colors:['#b6c0c7','#a9b4bc','#d1d4d3','#8e9da5','#c8c6be','#b9c6ca'],levels:6,glass:true,trees:true,shops:['カフェ','書店','薬局','レストラン','コンビニ','OFFICE']},
 osaka:{colors:['#bfc3c4','#d1c3af','#a9b0b4','#d9d5c8','#b9b2a8','#929fa5'],levels:5,glass:true,trees:true,shops:['喫茶','食堂','薬局','うどん','商店','OFFICE']},
 fukuoka:{colors:['#d5d0c3','#acb8be','#c7c9c6','#d6c0ac','#9faeb8','#d8d9d1'],levels:5,glass:true,trees:true,shops:['ラーメン','カフェ','薬局','うどん','書店','OFFICE']},
 kyoto:{colors:['#b7aa8f','#d7ccb7','#a79c89','#c3bba9','#d1cbbd','#a5aaa4'],levels:2,glass:false,trees:false,shops:['茶房','和菓子','そば','陶器','食堂','喫茶']},
 sapporo:{colors:['#c8b8a4','#b3b9bd','#d9d8d2','#b6c1c7','#c0c5c5','#a59485'],levels:5,glass:true,trees:true,shops:['珈琲','ラーメン','薬局','レストラン','書店','OFFICE']},
 okinawa:{colors:['#ece8da','#e2dccb','#d9d8d0','#efe9e0','#d6cfbd','#e8e4dc'],levels:3,glass:false,trees:true,shops:['食堂','COFFEE','商店','駐車場','薬局','沖縄そば']},
};
export function buildingHeight(feature,style,seed,urban){
 const levels=Number(feature.tags['building:levels']);
 if(feature.height>0)return feature.height;
 if(levels>0)return levels*3.1;
 const profile=CITY_STYLES[style]||CITY_STYLES.okinawa;
 return (style==='kyoto'?1+seed%3:urban?2+seed%profile.levels:1+seed%3)*3.1;
}
