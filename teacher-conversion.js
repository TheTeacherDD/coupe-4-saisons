(function(){
  const URL='https://dxbvklzpwjcebvkscnej.supabase.co';
  const KEY='sb_publishable_df2dl34QXUsD46jUMmX60A_AdvQQiJz';

  function getSession(){
    try{return JSON.parse(localStorage.getItem('c4s_session')||'null')}catch{return null}
  }

  function mondayISO(){
    const d=new Date();
    const day=(d.getDay()+6)%7;
    d.setHours(12,0,0,0);
    d.setDate(d.getDate()-day);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }

  function selectedHouse(){
    const el=document.querySelector('.pick.active');
    const txt=String(el&&el.textContent||'').toLowerCase();
    for(const id of ['verdelis','solor','feuillanor','givrecime']){
      if(txt.includes(id)) return id;
    }
    return null;
  }

  async function api(path,options={}){
    const s=getSession();
    if(!s||!s.access_token) throw new Error('Session absente');
    const r=await fetch(URL+path,{
      ...options,
      headers:{
        apikey:KEY,
        Authorization:'Bearer '+s.access_token,
        'Content-Type':'application/json',
        ...(options.headers||{})
      }
    });
    const txt=await r.text();
    if(!r.ok) throw new Error(txt);
    return txt?JSON.parse(txt):null;
  }

  async function activePeriod(){
    const rows=await api('/rest/v1/periods?archived=eq.false&order=name.asc&limit=1');
    return rows&&rows[0];
  }

  async function convert(button){
    const house=selectedHouse();
    if(!house){
      alert('Impossible de déterminer la maison sélectionnée.');
      return;
    }
    const p=await activePeriod();
    if(!p){
      alert('Aucune période active.');
      return;
    }
    const old=button.textContent;
    button.disabled=true;
    button.textContent='Transformation…';
    try{
      const result=await api('/rest/v1/rpc/convert_weekly_result',{
        method:'POST',
        body:JSON.stringify({
          p_house_id:house,
          p_week_start:mondayISO(),
          p_period_id:p.id
        })
      });
      const row=Array.isArray(result)?result[0]:result;
      const n=Number(row&&row.tokens_awarded||0);
      alert(n+' jeton'+(n>1?'s':'')+' ajouté'+(n>1?'s':'')+' au bocal de la classe.');
      location.reload();
    }catch(e){
      button.disabled=false;
      button.textContent=old;
      alert('Transformation impossible : '+String(e.message||e));
    }
  }

  function patch(){
    const buttons=[...document.querySelectorAll('button')];
    for(const b of buttons){
      const m=String(b.textContent||'').match(/Transformer en\s+(\d+)\s+jeton/i);
      if(!m||Number(m[1])<=0) continue;

      b.disabled=false;
      b.removeAttribute('disabled');
      b.removeAttribute('aria-disabled');
      b.style.pointerEvents='auto';
      b.style.cursor='pointer';
      b.style.opacity='1';

      if(b.dataset.teacherConversionPatch!=='1'){
        const clone=b.cloneNode(true);
        clone.disabled=false;
        clone.removeAttribute('disabled');
        clone.removeAttribute('aria-disabled');
        clone.style.pointerEvents='auto';
        clone.style.cursor='pointer';
        clone.style.opacity='1';
        clone.dataset.teacherConversionPatch='1';
        b.replaceWith(clone);
        clone.addEventListener('click',function(ev){
          ev.preventDefault();
          ev.stopImmediatePropagation();
          convert(clone);
        },true);
      }
    }
  }

  patch();
  setInterval(patch,400);
  new MutationObserver(patch).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','class']});
})();