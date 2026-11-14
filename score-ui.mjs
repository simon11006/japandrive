// Shared by the real arrival screen and the visual regression page.
export function renderDriveResult(root,{summary,courseName,parkingName,carName,distanceLabel,elapsed,onNext}){
  const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;if(className)node.className=className;return node;};
  root.replaceChildren();root.hidden=false;
  const label=el('small','드라이브 완료','result-kicker'),title=el('h1','주차까지, 잘 도착했습니다.');
  const meta=el('p',`${courseName||parkingName}\n${carName} · ${distanceLabel} · ${Math.floor(elapsed/60)}분 ${Math.floor(elapsed%60)}초`,'result-meta');
  const score=el('div',String(summary.score),'final-score');score.dataset.value=summary.score;score.append(el('span','점'));
  score.classList.toggle('is-negative',summary.score<0);
  const ledger=el('div',null,'score-ledger');ledger.setAttribute('aria-label','점수 합계');
  ledger.append(el('span',`획득 +${summary.earned}점`,'earned'),el('span',`감점 −${summary.deducted}점`,'deducted'));
  const panels=el('div',null,'result-feedback');
  for(const [kind,heading,items]of [['strengths','잘한 점',summary.strengths],['improvements','개선할 점',summary.improvements]]){
    const section=el('section',null,kind);section.append(el('h2',heading));
    if(!items.length)section.append(el('p',kind==='strengths'?'아직 평가할 안전운전 기록이 충분하지 않습니다.':'이번 코스에서 기록된 위반은 없습니다. 다음에는 다른 코스나 교통량으로 연습해 보세요.','feedback-empty'));
    else{
      const list=el('ul');
      for(const item of items){
        const li=el('li'),row=el('div',null,'feedback-title');
        row.append(el('strong',item.title),el('span',`${item.count}회 · ${kind==='strengths'?'+'+item.points:item.penalty?'−'+item.penalty:'안내'}${kind==='strengths'||item.penalty?'점':''}`));
        li.append(row,el('p',item.detail));list.append(li);
      }
      section.append(list);
    }
    panels.append(section);
  }
  const note=el('p','주행 중 확인된 행동을 정리한 연습 기록입니다. 코스 길이와 상황에 따라 얻을 수 있는 점수가 달라집니다.','fine');
  const button=el('button','다음 드라이브','primary');button.onclick=onNext;
  root.append(label,title,meta,score,ledger,panels,note,button);
  root.setAttribute('tabindex','-1');root.scrollTop=0;root.focus({preventScroll:true});
}
