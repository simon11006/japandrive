// Original models based on the street-photo references in WORLD-SCENERY.md.
// Mapped footprints/heights take priority; facade details are interpretations.
export const REGIONAL_SCENERY = {
 sydney:{facades:['sandstone','glass','brick','glass','stone','glass'],colors:['#ceb896','#9aabb4','#966f59','#9ca9af','#c9c1b4','#a0b6be'],roofs:['#575f63','#767a7b'],tree:'plane',awnings:true,roof:'flat',haze:'#d5dfe3',fog:.00022,ground:'#939a7f',ridge:'#75877a'},
 newtown:{facades:['brick','heritage','heritage','brick','heritage','weatherboard'],colors:['#a46e54','#ddc9a2','#b4b6a2','#8b6652','#d4c4ab','#bac7bf'],roofs:['#86634d','#5d6b68'],tree:'eucalyptus',awnings:true,roof:'terrace',haze:'#d9e0df',fog:.0003,ground:'#a6a486',ridge:'#738a71'},
 manly:{facades:['stucco','heritage','brick','stucco','weatherboard','stucco'],colors:['#e3d9bf','#e4cea1','#ba9680','#c7d4d1','#d4d3c9','#d6c6ae'],roofs:['#b18363','#6b7679'],tree:'norfolk',awnings:true,roof:'coastal',haze:'#d0e5e9',fog:.00017,ground:'#b5b19a',ridge:'#719171',water:'#327f96'},
 katoomba:{facades:['heritage','brick','weatherboard','heritage','brick','weatherboard'],colors:['#c7b797','#a48063','#b5bdb2','#ded1b1','#97725c','#c9c9b9'],roofs:['#526361','#766f65'],tree:'eucalyptus',awnings:true,roof:'gable',haze:'#bdcddd',fog:.00018,ground:'#899478',ridge:'#536f74'},
 auckland:{facades:['stone','glass','heritage','glass','brick','glass'],colors:['#d0c5b0','#8ea5b1','#d7c9aa','#93aebc','#a98b77','#b0c0c5'],roofs:['#4c5b64','#6d7779'],tree:'pohutukawa',awnings:true,roof:'flat',haze:'#ccdce6',fog:.0002,ground:'#8f9b7d',ridge:'#688679'},
 devonport:{facades:['weatherboard','heritage','weatherboard','brick','weatherboard','heritage'],colors:['#e3dfd0','#d7c5a7','#c2cfcb','#a17e67','#c7cbc2','#e0d4ba'],roofs:['#5f736a','#8d695c'],tree:'pohutukawa',awnings:true,roof:'villa',haze:'#d0e2e5',fog:.0002,ground:'#9baa80',ridge:'#668671',water:'#397f8b'},
 'mission-bay':{facades:['stucco','weatherboard','brick','stucco','weatherboard','heritage'],colors:['#e4dcc7','#cbd8d3','#b69b80','#d4cec1','#b8cacb','#e2d0b1'],roofs:['#b47c56','#647a76'],tree:'pohutukawa',awnings:true,roof:'coastal',haze:'#cce4e9',fog:.00015,ground:'#9bac7d',ridge:'#5e8769',water:'#438d9b'},
 queenstown:{facades:['schist','timber','stucco','schist','timber','glass'],colors:['#9e9b89','#756552','#d0ccbb','#858d87','#9d8e79','#9aafb3'],roofs:['#4b6157','#5c6260'],tree:'alpine',awnings:true,roof:'alpine',haze:'#cbdde9',fog:.000055,ground:'#a3a28b',ridge:'#a29a7c',water:'#306576'},
};
export function regionalKey(style){return REGIONAL_SCENERY[style]?style:null;}
export function regionalBuilding(feature,style,seed,height){
 const p=REGIONAL_SCENERY[style];if(!p)return null;
 const residential=/^(house|detached|semidetached_house|terrace|residential|bungalow)$/.test(feature.tags.building||'');
 let kind=residential?(style==='newtown'?'heritage':style==='queenstown'?'timber':'weatherboard'):p.facades[seed%p.facades.length];
 if(height>24)kind=p.facades.includes('glass')?'glass':'stucco';
 const roof=feature.tags['roof:shape']||((height>15||kind==='glass'||(!residential&&['heritage','brick'].includes(kind)))?'flat':'gabled');
 return {kind,color:p.colors[seed%p.colors.length],roof:roof==='flat'?'flat':'gabled',roofColor:p.roofs[seed%p.roofs.length],residential,veranda:residential&&['devonport','newtown'].includes(style),cornice:kind==='heritage'||kind==='sandstone',awning:!residential&&height<35};
}
export function regionalGroundColor(style,height,slope=0){
 const p=REGIONAL_SCENERY[style];if(!p)return height>30?'#668563':'#a8b59a';
 if(style==='queenstown')return height>1100||slope>.75?'#a29a8b':height>700?'#a29d7e':height>450?'#687c64':p.ground;
 if(style==='katoomba')return slope>.8?'#a49b82':height<900?p.ridge:p.ground;
 return p.ground;
}
