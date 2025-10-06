// api.js — JS proxy προς Supabase (ίδιες actions με api.php), ΧΩΡΙΣ imports/modules
(function () {
  const SUPABASE_URL ="https://wjsapjgmuplhpjzhilin.supabase.co";
  const SUPABASE_ANON_KEY ="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqc2FwamdtdXBsaHBqemhpbGluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0NDY1MTUsImV4cCI6MjA3MTAyMjUxNX0.7gJFVRoGfCrVVwyIAB_GWf_Xy85wBT4behIm73zQoZY";

  const T = {
    members: 'members',
    attendance: 'attendance',
    weights: 'weights',
    measurements: 'measurements',
    v_member_stats: 'v_member_stats',
    login: 'login', // πίνακας με name, password (ΜΟΝΟ)
  };

  // Τι να δείχνει η στήλη "Έτος" στο UI από το view
  const YEAR_FIELD = 'total_all_time';

  if (!window.supabase) {
    console.error('[api.js] Missing supabase-js. Load it before this file.');
  }
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ---------- Auth (client session) ----------
  const AUTH_KEY = 'auth_user';
  const getAuth = () => { try { return JSON.parse(sessionStorage.getItem(AUTH_KEY) || 'null'); } catch { return null; } };
  const setAuth = (obj) => sessionStorage.setItem(AUTH_KEY, JSON.stringify(obj||{}));
  const clearAuth = () => sessionStorage.removeItem(AUTH_KEY);
  const requireAuth = () => { if (!getAuth()) { const e=new Error('AUTH_REQUIRED'); e.code='AUTH_REQUIRED'; throw e; } };

  const pad2 = n => String(n).padStart(2,'0');
  const todayISO = () => { const d=new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; };
  const ok = v => v ?? null;

  async function yearTotals(fromISO, toISO){
    let q = sb.from(T.attendance).select('member_id').eq('present', true);
    if (fromISO) q = q.gte('attended_on', fromISO);
    if (toISO)   q = q.lte('attended_on', toISO);
    const { data, error } = await q;
    if (error) throw error;
    const agg = {};
    for (const r of (data||[])) { if (r.member_id==null) continue; agg[r.member_id]=(agg[r.member_id]||0)+1; }
    return agg;
  }

  async function totalsFromMemberView(field){
    const { data, error } = await sb.from(T.v_member_stats)
      .select(`id, ${field}`).order('id',{ascending:true}).limit(10000);
    if (error) throw error;
    const agg={}; for (const r of (data||[])) agg[r.id]=Number(r[field]||0); return agg;
  }

  async function api(action, { method='GET', params=null, body=null } = {}) {
    // PING (χωρίς login)
    if (action === 'ping') {
      const { error } = await sb.from(T.v_member_stats).select('id', { head:true }).limit(1);
      if (error) throw error;
      return { ok:true };
    }

    // ===== AUTH (χωρίς role) =====
  if (action === 'auth_login' && method === 'POST') {
  // Ομαλοποίηση εισόδου
  const name = (body?.name ?? '').toString().trim();
  const passwordInput = (body?.password ?? '').toString().trim();
  if (!name || !passwordInput) throw new Error('name & password required');

  // Διαβάζουμε ΜΟΝΟ με το name (case-insensitive)
  const { data, error } = await sb
    .from(T.login)              // public.login
    .select('name, password')   // δεν υπάρχει role
    .ilike('name', name)        // admin == ADMIN == Admin
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const e = new Error('INVALID_CREDENTIALS');
    e.code = 'INVALID_CREDENTIALS';
    throw e;
  }

  // Σύγκριση password ως string (για να μην κολλάει αν ήταν numeric)
  const passwordDb = (data.password ?? '').toString().trim();
  if (passwordDb !== passwordInput) {
    const e = new Error('INVALID_CREDENTIALS');
    e.code = 'INVALID_CREDENTIALS';
    throw e;
  }

  // OK -> session μόνο με name
  setAuth({ name: data.name, at: Date.now() });
  return { ok: true, user: { name: data.name } };
}


    if (action === 'auth_logout') { clearAuth(); return { ok:true }; }

    // Από εδώ και κάτω: απαιτείται login
    requireAuth();

    // ===== MEMBERS (reads από VIEW) =====
    if (action === 'add_member' && method === 'POST') {
      const first=(body?.first_name||'').trim(), last=(body?.last_name||'').trim();
      if (!first || !last) throw new Error('first_name & last_name required');
      const { data, error } = await sb.from(T.members).insert({ first_name:first, last_name:last }).select('id').single();
      if (error) throw error; return { id:data.id };
    }

    if (action === 'search_members') {
      const q=(params?.q||'').trim();
      let sel = sb.from(T.v_member_stats)
        .select('id,first_name,last_name,counter_epoch,total_since_reset,total_all_time')
        .order('id',{ascending:false}).limit(500);
      if (q) sel = sel.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`);
      const { data, error } = await sel; if (error) throw error; return data||[];
    }

    if (action === 'members_basic') {
      const q=(params?.q||'').trim();
      let sel = sb.from(T.v_member_stats)
        .select('id,first_name,last_name,counter_epoch,total_since_reset,total_all_time')
        .order('id',{ascending:true}).limit(10000);
      if (q) sel = sel.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`);
      const { data, error } = await sel; if (error) throw error; return data||[];
    }

    if (action === 'year_totals') {
      return await totalsFromMemberView(YEAR_FIELD);
    }

    if (action === 'get_member') {
      const id=Number(params?.id||0);
      const { data, error } = await sb.from(T.v_member_stats)
        .select('id,first_name,last_name,counter_epoch,total_since_reset,total_all_time')
        .eq('id', id).limit(1);
      if (error) throw error; return data||[];
    }

    if (action === 'update_member' && method === 'POST') {
      const p=body||{}; if (!p.id) throw new Error('id required');
      const upd={}; ['first_name','last_name','counter_epoch'].forEach(k=>{ if (p.hasOwnProperty(k)) upd[k]=p[k]; });
      const { error } = await sb.from(T.members).update(upd).eq('id', Number(p.id));
      if (error) throw error; return { ok:true };
    }

    if (action === 'reset_counter' && method === 'POST') {
      const id=Number(body?.id||0);
      const { error } = await sb.from(T.members).update({ counter_epoch: todayISO() }).eq('id', id);
      if (error) throw error; return { ok:true };
    }

    // ===== ATTENDANCE =====
    if (action === 'upsert_attendance' && method === 'POST') {
      const p=body||{};
      const rec={ member_id:Number(p.member_id||0), attended_on:p.attended_on||todayISO(), present:true, note:ok(p.note) };
      const { data, error } = await sb.from(T.attendance).upsert(rec, { onConflict:'member_id,attended_on' }).select().limit(1);
      if (error) throw error; return data?.[0] || { ok:true };
    }

    if (action === 'list_attendance') {
      const date=params?.date||todayISO();
      const { data, error } = await sb.from(T.attendance)
        .select('id,attended_on,present,note,members:member_id(id,first_name,last_name)')
        .eq('attended_on', date).order('id',{ascending:false}).limit(300);
      if (error) throw error; return data||[];
    }

    if (action === 'update_attendance_note' && method === 'POST') {
      const id=Number(body?.id||0);
      const { error } = await sb.from(T.attendance).update({ note: ok(body?.note) }).eq('id', id);
      if (error) throw error; return { ok:true };
    }

    if (action === 'toggle_attendance' && method === 'POST') {
      const id=Number(body?.id||0); const present=!!body?.present;
      const { error } = await sb.from(T.attendance).update({ present: !present }).eq('id', id);
      if (error) throw error; return { ok:true };
    }

    // ===== REPORTS =====
    if (action === 'count_attendance') {
      const mid=Number(params?.member_id||0), from=params?.from||null, to=params?.to||null;
      let q=sb.from(T.attendance).select('id',{count:'exact', head:true})
        .eq('member_id', mid).eq('present', true).limit(20000);
      if (from) q=q.gte('attended_on', from); if (to) q=q.lte('attended_on', to);
      const { count, error } = await q; if (error) throw error; return { count: count||0 };
    }

    if (action === 'report_attendance') {
      const now=new Date(), ym=`${now.getFullYear()}-${pad2(now.getMonth()+1)}`;
      const from=params?.from||`${ym}-01`, last=new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
      const to=params?.to||`${ym}-${pad2(last)}`;
      let q=sb.from(T.attendance).select('id,attended_on,present').eq('present', true)
        .order('attended_on',{ascending:true}).limit(20000);
      q=q.gte('attended_on', from).lte('attended_on', to);
      const { data, error } = await q; if (error) throw error; return data||[];
    }

    // ===== WEIGHTS =====
    if (action === 'add_weight' && method === 'POST') {
      const p=body||{}; const mid=Number(p.member_id||0); const wkg=p.weight_kg; const date=p.measured_on||todayISO();
      if (mid<=0 || wkg===undefined || wkg===null) throw new Error('member_id & weight_kg required');
      const payload={ member_id:mid, measured_on:date, weight_kg:wkg };
      const { data, error } = await sb.from(T.weights).upsert(payload, { onConflict:'member_id,measured_on' }).select().limit(1);
      if (error) throw error; return data?.[0] || { ok:true };
    }

    if (action === 'list_weights') {
      const mid=Number(params?.member_id||0); if (mid<=0) throw new Error('member_id required');
      let q=sb.from(T.weights).select('id,member_id,measured_on,weight_kg').eq('member_id', mid).order('measured_on',{ascending:false}).limit(3650);
      if (params?.from) q=q.gte('measured_on', params.from); if (params?.to) q=q.lte('measured_on', params.to);
      const { data, error } = await q; if (error) throw error; return data||[];
    }

    if (action === 'members_with_latest_weight') {
      const qstr=(params?.q||'').trim();
      let sel=sb.from(T.members)
        .select('id,first_name,last_name,weights:weights!left(member_id,weight_kg,measured_on)')
        .order('id',{ascending:true}).order('measured_on',{referencedTable:'weights',ascending:false})
        .limit(1,{referencedTable:'weights'}).limit(10000);
      if (qstr) sel=sel.or(`first_name.ilike.%${qstr}%,last_name.ilike.%${qstr}%`);
      const { data, error } = await sel; if (error) throw error; return data||[];
    }

    // ===== MEMBER CARD (list από VIEW) =====
    if (action === 'list_members') {
      const { data, error } = await sb.from(T.v_member_stats)
        .select('id,first_name,last_name,total_since_reset,total_all_time')
        .order('id',{ascending:true}).limit(10000);
      if (error) throw error; return data||[];
    }

    // Προφίλ μέλους (κρατάμε τα στοιχεία από τον πίνακα)
    if (action === 'member_get') {
      const id=Number(params?.id||0);
      const { data, error } = await sb.from(T.members)
        .select('id,first_name,last_name,counter_epoch,dob,address,phone,email,medical_notes')
        .eq('id', id).limit(1);
      if (error) throw error; return { ok:true, data: data?.[0] || null };
    }

    if (action === 'member_save' && method === 'POST') {
      const p=body||{}; const id=Number(p.id||0); if (!id) throw new Error('id required');
      const payload={}; ['first_name','last_name','dob','address','phone','email','medical_notes'].forEach(k=>{ if (p.hasOwnProperty(k)) payload[k]=p[k]; });
      const { error } = await sb.from(T.members).update(payload).eq('id', id);
      if (error) throw error; return { ok:true };
    }

    // ===== MEASUREMENTS =====
    if (action === 'meas_list') {
      const mid=Number(params?.member_id||0); if (mid<=0) throw new Error('member_id required');
      const { data, error } = await sb.from(T.measurements)
        .select('id,member_id,measured_on,weight_kg,fat_percent,twb,mbw,kcal,bones,visceral,created_at')
        .eq('member_id', mid).order('measured_on',{ascending:false}).order('id',{ascending:false}).limit(5000);
      if (error) throw error; return { ok:true, data: data||[] };
    }

    if (action === 'meas_add' && method === 'POST') {
      const p=body||{}; const rec={
        member_id:Number(p.member_id||0), measured_on:p.measured_on||todayISO(),
        weight_kg:p.weight_kg??null, fat_percent:p.fat_percent??null, twb:p.twb??null,
        mbw:p.mbw??null, kcal:p.kcal??null, bones:p.bones??null, visceral:p.visceral??null,
      };
      const { data, error } = await sb.from(T.measurements).insert(rec).select().limit(1);
      if (error) throw error; return { ok:true, data: data?.[0] || null };
    }

    if (action === 'meas_delete') {
      const id=Number((method==='POST'?body?.id:params?.id)||0); if (!id) throw new Error('id required');
      const { error } = await sb.from(T.measurements).delete().eq('id', id);
      if (error) throw error; return { ok:true };
    }

    throw new Error('Unknown action');
  }

  window.api = api;
  window.auth = { get:getAuth, logout:()=>clearAuth() };
})();
