(function(){
  const baseSettings = settings;
  const baseArchives = archives;
  const baseBind = bind;

  let pmPreview = null;
  let archivePeriodId = null;
  let hist = {ready:false,error:null,results:[],batches:[],items:[],closures:[]};

  const frDateTime = (s)=>new Date(s).toLocaleString('fr-FR',{
    day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Paris'
  });

  const periodSort = (a,b)=>{
    const na=Number(a.name), nb=Number(b.name);
    if(Number.isFinite(na)&&Number.isFinite(nb)) return na-nb;
    return String(a.name).localeCompare(String(b.name),'fr');
  };

  async function loadHistory(){
    try{
      const [results,batches,items,closures] = await Promise.all([
        sel('weekly_results',{}),
        sel('academy_transfer_batches',{}),
        sel('academy_transfer_items',{}),
        sel('period_closures',{}).catch(()=>[])
      ]);
      hist={ready:true,error:null,results:results||[],batches:batches||[],items:items||[],closures:closures||[]};
    }catch(e){
      hist={...hist,ready:true,error:String(e.message||e)};
    }
    try{ if(typeof view!=='undefined' && view==='archives') render(); }catch{}
  }

  function activeAndNext(){
    const active=period();
    const next=refs.periods.filter(p=>!p.archived && (!active || p.id!==active.id)).slice().sort(periodSort)[0]||null;
    return {active,next};
  }

  function totalsSummary(arr){
    return (arr||[]).reduce((n,x)=>n+Number(x.tokens||0),0);
  }

  async function verifyPeriod(){
    const {active,next}=activeAndNext();
    if(!active){ t('Aucune période active.'); return; }
    const btn=document.getElementById('pmPreview');
    if(btn) btn.disabled=true;
    try{
      const [results,items,classTotals,academyTotals]=await Promise.all([
        sel('weekly_results',{period_id:'eq.'+active.id}),
        sel('academy_transfer_items',{}),
        sel('class_token_totals',{period_id:'eq.'+active.id}),
        sel('academy_token_totals',{period_id:'eq.'+active.id})
      ]);
      const transferred=new Set((items||[]).map(x=>x.weekly_result_id));
      const pendingRows=(results||[]).filter(x=>!transferred.has(x.id));
      pmPreview={
        periodId:active.id,
        periodName:active.name,
        nextName:next&&next.name,
        pending:pendingRows.length,
        classTotals:classTotals||[],
        academyTotals:academyTotals||[]
      };
      render();
      t(pmPreview.pending ? 'Vérification terminée : transfert(s) restant(s).' : 'Vérification réussie.');
    }catch(e){
      t('Vérification impossible : '+String(e.message||e));
    }finally{
      const b=document.getElementById('pmPreview');
      if(b) b.disabled=false;
    }
  }

  async function closePeriod(){
    if(!pmPreview || pmPreview.pending) return;
    const code='CLOTURER'+pmPreview.periodName;
    const answer=prompt(
      'Cette action clôturera réellement la période '+pmPreview.periodName+
      ' et activera la suivante.\n\nAucune donnée ne sera supprimée.\n\nPour confirmer, recopiez :\n'+code
    );
    if(answer!==code){ t('Clôture annulée.'); return; }

    const btn=document.getElementById('pmClose');
    if(btn) btn.disabled=true;
    try{
      const data=await rpc('close_period',{p_period_id:pmPreview.periodId});
      const row=Array.isArray(data)?data[0]:data;
      alert(
        'Période '+pmPreview.periodName+' clôturée.\n'+
        'La période '+((row&&row.next_period_name)||pmPreview.nextName||'suivante')+' est maintenant active.\n\n'+
        'Les historiques et les totaux de fin de période sont conservés.'
      );
      location.reload();
    }catch(e){
      if(btn) btn.disabled=false;
      const msg=String(e.message||e);
      t(msg.includes('untransferred_results')
        ? 'Clôture bloquée : des résultats restent à transférer.'
        : 'Clôture impossible : '+msg);
    }
  }

  settings=function(){
    const {active,next}=activeAndNext();
    let verification='';
    if(pmPreview && active && pmPreview.periodId===active.id){
      const classSum=totalsSummary(pmPreview.classTotals);
      const academySum=totalsSummary(pmPreview.academyTotals);
      if(pmPreview.pending){
        verification='<div class="note" style="margin-top:14px;border-color:#c56f42">'+
          '<b>'+pmPreview.pending+' résultat'+(pmPreview.pending>1?'s':'')+' encore non transféré'+(pmPreview.pending>1?'s':'')+'.</b><br>'+
          '<span class="tiny">La clôture reste bloquée tant que ces jetons ne sont pas transférés vers l’Académie.</span></div>';
      }else{
        verification='<div class="note" style="margin-top:14px;border-color:#6fa57e">'+
          '<b>Vérification réussie.</b> Aucun résultat n’est en attente de transfert.<br>'+
          '<span class="tiny">Totaux actuels : '+classSum+' jeton'+(classSum>1?'s':'')+' dans les classes • '+academySum+' jeton'+(academySum>1?'s':'')+' dans les bocaux communs.</span><br>'+
          '<button id="pmClose" class="btn danger" style="margin-top:12px">Clôturer la période '+esc(active.name)+'</button>'+
          '<div class="tiny" style="margin-top:8px">À utiliser uniquement à la vraie fin de la période. Une confirmation par le code CLOTURER'+esc(active.name)+' sera demandée.</div>'+
          '</div>';
      }
    }

    const periodCard =
      '<div class="section"><div><h2>Gestion des périodes</h2><p>Clôturer une période conserve les historiques et active la suivante avec ses compteurs à 0.</p></div></div>'+
      '<div class="card" style="margin-bottom:18px">'+
        '<h3>'+(active?'Période '+esc(active.name):'Aucune période active')+'</h3>'+
        '<p class="muted">Période suivante : '+(next?'Période '+esc(next.name):'aucune')+'</p>'+
        (active?'<button id="pmPreview" class="btn">Vérifier avant clôture</button>':'')+
        verification+
      '</div>';

    return periodCard + baseSettings();
  };

  function closureSummary(cl){
    if(!cl) return '';
    const classRows=(cl.class_totals||[]).map(r=>
      '<tr><td>'+cn(r.class_id)+'</td><td>'+hn(r.house_id)+'</td><td><b>'+r.tokens+'</b></td></tr>'
    ).join('');
    const academyRows=(cl.academy_totals||[]).map(r=>
      '<tr><td>'+hn(r.house_id)+'</td><td><b>'+r.tokens+'</b></td></tr>'
    ).join('');
    return '<div class="card" style="margin-bottom:18px">'+
      '<h3>Bilan de fin de période</h3>'+
      '<div class="note" style="margin-bottom:12px">Période clôturée le <b>'+frDateTime(cl.closed_at)+'</b>. Ces totaux sont figés dans l’historique.</div>'+
      '<div class="grid" style="grid-template-columns:1fr 1fr">'+
        '<div><h4>Totaux classes</h4><div class="scroll"><table><thead><tr><th>Classe</th><th>Maison</th><th>Jetons</th></tr></thead><tbody>'+classRows+'</tbody></table></div></div>'+
        '<div><h4>Totaux Académie</h4><div class="scroll"><table><thead><tr><th>Maison</th><th>Jetons</th></tr></thead><tbody>'+academyRows+'</tbody></table></div></div>'+
      '</div></div>';
  }

  archives=function(){
    if(!hist.ready){
      loadHistory();
      return baseArchives()+'<div class="note" style="margin-top:16px">Chargement de l’historique complet…</div>';
    }
    const active=period();
    const chosen=archivePeriodId || (active&&active.id) || (refs.periods[0]&&refs.periods[0].id);
    const pp=refs.periods.find(p=>p.id===chosen) || active;
    if(!chosen) return baseArchives();

    const opts=refs.periods.slice().sort(periodSort).map(p=>
      '<option value="'+p.id+'" '+(p.id===chosen?'selected':'')+'>Période '+esc(p.name)+(p.archived?' — clôturée':'')+'</option>'
    ).join('');

    const rows=(hist.results||[]).filter(r=>r.period_id===chosen).slice().sort((a,b)=>b.week_start.localeCompare(a.week_start));
    const batches=(hist.batches||[]).filter(b=>b.period_id===chosen);
    const batchIds=new Set(batches.map(b=>b.id));
    const transfers=(hist.items||[]).filter(i=>batchIds.has(i.batch_id)).map(i=>{
      const b=batches.find(x=>x.id===i.batch_id);
      return {...i,transferred_at:b&&b.transferred_at};
    }).sort((a,b)=>new Date(b.transferred_at)-new Date(a.transferred_at));
    const cl=(hist.closures||[]).find(x=>x.period_id===chosen);

    const conv=rows.length
      ? '<div class="scroll"><table><thead><tr><th>Semaine</th><th>Classe</th><th>Maison</th><th>Jetons</th></tr></thead><tbody>'+
        rows.map(r=>'<tr><td>'+weekLabel(r.week_start)+'</td><td>'+cn(r.class_id)+'</td><td>'+hn(r.house_id)+'</td><td><b>'+r.tokens_awarded+'</b></td></tr>').join('')+
        '</tbody></table></div>'
      : '<div class="empty">Aucune conversion pour cette période.</div>';

    const trans=transfers.length
      ? '<div class="scroll"><table><thead><tr><th>Date du transfert</th><th>Classe</th><th>Maison</th><th>Jetons transférés</th></tr></thead><tbody>'+
        transfers.map(r=>'<tr><td>'+frDateTime(r.transferred_at)+'</td><td>'+cn(r.class_id)+'</td><td>'+hn(r.house_id)+'</td><td><b>'+r.quantity+'</b></td></tr>').join('')+
        '</tbody></table></div>'
      : '<div class="empty">Aucun transfert vers l’Académie pour cette période.</div>';

    return '<div class="section"><div><h2>Archives de l’Académie</h2><p>Historique conservé période par période.</p></div>'+
      '<label class="tiny">Période consultée<br><select id="archivePeriod" style="margin-top:6px;padding:10px 12px;border-radius:12px;border:1px solid var(--line);background:#100d17;color:var(--ink)">'+opts+'</select></label></div>'+
      (hist.error?'<div class="note">'+esc(hist.error)+'</div>':'')+
      closureSummary(cl)+
      '<div class="card"><h3>Conversions des semaines</h3>'+conv+'</div>'+
      '<div class="card" style="margin-top:18px"><h3>Transferts vers l’Académie</h3>'+trans+'</div>';
  };


  function selectedHouseId(){
    const el=document.querySelector('.pick.active') || document.querySelector('.pick[aria-pressed="true"]');
    const txt=String(el&&el.textContent||'').toLowerCase();
    for(const id of ['verdelis','solor','feuillanor','givrecime']){
      if(txt.includes(id)) return id;
    }
    try{
      if(typeof cHouse!=='undefined' && cHouse) return cHouse;
    }catch{}
    return null;
  }

  function patchTeacherTransformButton(){
    const candidates=[...document.querySelectorAll('button')];
    const original=candidates.find(b=>/Transformer en\s+\d+\s+jeton/i.test(String(b.textContent||'')));
    if(!original) return;

    const m=String(original.textContent||'').match(/Transformer en\s+(\d+)\s+jeton/i);
    const n=m?Number(m[1]):0;
    if(n<=0 || original.dataset.c4sTeacherFixed==='1') return;

    const clone=original.cloneNode(true);
    clone.disabled=false;
    clone.removeAttribute('disabled');
    clone.removeAttribute('aria-disabled');
    clone.style.pointerEvents='auto';
    clone.style.opacity='1';
    clone.style.cursor='pointer';
    clone.dataset.c4sTeacherFixed='1';
    original.replaceWith(clone);

    clone.addEventListener('click',async ev=>{
      ev.preventDefault();
      ev.stopPropagation();
      const house=selectedHouseId();
      if(!house){
        t('Maison sélectionnée introuvable.');
        return;
      }
      clone.disabled=true;
      const old=clone.textContent;
      clone.textContent='Transformation…';
      try{
        const p=period();
        if(!p) throw new Error('Aucune période active');
        const result=await rpc('convert_weekly_result',{
          p_house_id:house,
          p_week_start:monday(),
          p_period_id:p.id
        });
        await load();
        render();
        const row=Array.isArray(result)?result[0]:result;
        const qty=Number(row&&row.tokens_awarded||n);
        t(qty+' jeton'+(qty>1?'s':'')+' ajouté'+(qty>1?'s':'')+' au bocal de la classe.');
      }catch(e){
        clone.disabled=false;
        clone.textContent=old;
        t('Transformation impossible : '+String(e.message||e));
      }
    },{once:true});
  }

  const transformObserver=new MutationObserver(()=>patchTeacherTransformButton());
  transformObserver.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','class']});
  setTimeout(patchTeacherTransformButton,0);

  async function teacherConvertCurrentHouse(btn){
    const match=String(btn.textContent||'').match(/Transformer en\\s+(\\d+)\\s+jeton/i);
    const shownTotal=match?Number(match[1]):0;
    if(shownTotal<=0) return;
    btn.disabled=true;
    const oldText=btn.textContent;
    btn.textContent='Transformation…';
    try{
      const p=period();
      if(!p) throw new Error('Aucune période active');
      const result=await rpc('convert_weekly_result',{
        p_house_id:cHouse,
        p_week_start:monday(),
        p_period_id:p.id
      });
      await load();
      render();
      const row=Array.isArray(result)?result[0]:result;
      const n=Number(row&&row.tokens_awarded||shownTotal);
      t(n+' jeton'+(n>1?'s':'')+' ajouté'+(n>1?'s':'')+' au bocal de la classe.');
    }catch(e){
      btn.disabled=false;
      btn.textContent=oldText;
      t('Transformation impossible : '+String(e.message||e));
    }
  }

  bind=function(){
    baseBind();
    const preview=document.getElementById('pmPreview');
    if(preview) preview.addEventListener('click',verifyPeriod);
    const close=document.getElementById('pmClose');
    if(close) close.addEventListener('click',closePeriod);
    const picker=document.getElementById('archivePeriod');
    if(picker) picker.addEventListener('change',e=>{archivePeriodId=e.target.value;render();});

    const transform=[...document.querySelectorAll('button')].find(b=>/Transformer en\\s+\\d+\\s+jeton/i.test(b.textContent||''));
    if(transform && transform.disabled){
      const m=String(transform.textContent||'').match(/Transformer en\\s+(\\d+)\\s+jeton/i);
      const n=m?Number(m[1]):0;
      if(n>0){
        transform.disabled=false;
        transform.title='Transformer les points en jetons de la classe';
        transform.addEventListener('click',()=>teacherConvertCurrentHouse(transform),{once:true});
      }
    }
  };

  loadHistory();
})();